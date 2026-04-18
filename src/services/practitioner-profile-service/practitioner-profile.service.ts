import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Doctor, Prisma } from '@prisma/client';
import {
  BOOKING_CREATED_EVENT,
  type BookingCreatedEventPayload,
} from '../../events/booking-created.event';
import type { UpdateDoctorEditableFieldsDto } from './dto/update-doctor-editable-fields.dto';
import { PractitionerProfilePrismaService } from './practitioner-profile-prisma.service';
import { PractitionerProfileRedisService } from './practitioner-profile-redis.service';

interface HelloWorldRow {
  message: string;
}

export interface DoctorTagsResponse {
  doctorId: number;
  tags: string[];
}

const DOCTORS_CACHE_KEY = 'practitioner-profile:doctors';
const DEFAULT_DOCTORS_CACHE_TTL_SECONDS = 60;

const ADDRESS_FIELDS = [
  'street',
  'postalCode',
  'city',
  'country',
  'addressExtra',
] as const;

function getErrorDetails(error: unknown): string {
  const details = [stringifyError(error)];
  const cause = getErrorCause(error);

  if (cause) {
    details.push(`Cause: ${stringifyError(cause)}`);
  }

  return details.join('\n');
}

function getErrorCause(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('cause' in error)) {
    return undefined;
  }

  return (error as { cause?: unknown }).cause;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function hasOwn(value: object, key: string): boolean {
  return Object.hasOwn(value, key);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecordNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}

function readNullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException(`${fieldName} must be a string or null`);
  }

  return value;
}

function readTags(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value.trim() || null;
  }

  if (!Array.isArray(value) || !value.every((tag) => typeof tag === 'string')) {
    throw new BadRequestException(
      'tags must be a string, string array, or null',
    );
  }

  const tags = value.map((tag) => tag.trim()).filter(Boolean);

  return tags.length > 0 ? tags.join(', ') : null;
}

function splitTags(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function buildOpenHoursWithBookedSlot(
  openHours: unknown,
  event: BookingCreatedEventPayload,
): Prisma.InputJsonValue {
  const base: Record<string, unknown> = isObjectRecord(openHours)
    ? { ...openHours }
    : {};

  if (
    openHours !== null &&
    openHours !== undefined &&
    !isObjectRecord(openHours)
  ) {
    base.schedule = openHours;
  }

  const existingBookedSlots: unknown[] = Array.isArray(base.bookedSlots)
    ? Array.from(base.bookedSlots as unknown[])
    : [];
  const bookedSlot = {
    bookingId: event.bookingId,
    patientId: event.patientId,
    tag: event.tag,
    slot: event.slot,
    status: event.status,
  };
  const bookedSlots = existingBookedSlots.filter(
    (slot) => !isObjectRecord(slot) || slot.bookingId !== event.bookingId,
  );

  return {
    ...base,
    bookedSlots: [...bookedSlots, bookedSlot],
  } as Prisma.InputJsonValue;
}

function readJsonValue(value: unknown) {
  if (value === null) {
    return Prisma.DbNull;
  }

  return value as Prisma.InputJsonValue;
}

function getPositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class PractitionerProfileService {
  private readonly logger = new Logger(PractitionerProfileService.name);
  private readonly doctorsCacheTtlSeconds = getPositiveInteger(
    process.env.REDIS_DOCTORS_TTL_SECONDS,
    DEFAULT_DOCTORS_CACHE_TTL_SECONDS,
  );

  constructor(
    private readonly practitionerProfilePrisma: PractitionerProfilePrismaService,
    private readonly practitionerProfileRedis: PractitionerProfileRedisService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getHelloFromPrisma(): Promise<string> {
    const rows = await this.practitionerProfilePrisma.$queryRaw<
      HelloWorldRow[]
    >`SELECT ${this.getHello()} AS message`;

    return rows[0]?.message ?? this.getHello();
  }

  async findDoctors(): Promise<Doctor[]> {
    const cachedDoctors =
      await this.practitionerProfileRedis.getJson<Doctor[]>(DOCTORS_CACHE_KEY);

    if (cachedDoctors) {
      return cachedDoctors;
    }

    try {
      const doctors = await this.practitionerProfilePrisma.doctor.findMany({
        orderBy: {
          createdAt: 'desc',
        },
      });

      await this.practitionerProfileRedis.setJson(
        DOCTORS_CACHE_KEY,
        doctors,
        this.doctorsCacheTtlSeconds,
      );

      return doctors;
    } catch (error) {
      this.logger.error(
        'Failed to fetch doctors from the database',
        getErrorDetails(error),
      );

      throw new ServiceUnavailableException(
        'Unable to load doctors from the database',
      );
    }
  }

  async findDoctorTags(id: number): Promise<DoctorTagsResponse> {
    const cachedDoctors =
      await this.practitionerProfileRedis.getJson<Doctor[]>(DOCTORS_CACHE_KEY);
    const cachedDoctor = cachedDoctors?.find((doctor) => doctor.id === id);

    if (cachedDoctor) {
      return {
        doctorId: id,
        tags: splitTags(cachedDoctor.speciality),
      };
    }

    try {
      const doctor = await this.practitionerProfilePrisma.doctor.findUnique({
        where: { id },
        select: {
          id: true,
          speciality: true,
        },
      });

      if (!doctor) {
        throw new NotFoundException(`Doctor ${id} was not found`);
      }

      return {
        doctorId: doctor.id,
        tags: splitTags(doctor.speciality),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Failed to fetch tags for doctor ${id} from the database`,
        getErrorDetails(error),
      );

      throw new ServiceUnavailableException(
        'Unable to load doctor tags from the database',
      );
    }
  }

  @OnEvent(BOOKING_CREATED_EVENT, { async: true })
  async handleBookingCreated(event: BookingCreatedEventPayload): Promise<void> {
    try {
      await this.markDoctorSlotBooked(event);
    } catch (error) {
      this.logger.error(
        `Failed to update doctor ${event.doctorId} booked slot for booking ${event.bookingId}`,
        getErrorDetails(error),
      );
    }
  }

  async markDoctorSlotBooked(event: BookingCreatedEventPayload): Promise<void> {
    const doctor = await this.practitionerProfilePrisma.doctor.findUnique({
      where: { id: event.doctorId },
      select: {
        id: true,
        openHours: true,
      },
    });

    if (!doctor) {
      throw new NotFoundException(`Doctor ${event.doctorId} was not found`);
    }

    const updatedDoctor = await this.practitionerProfilePrisma.doctor.update({
      where: { id: event.doctorId },
      data: {
        openHours: buildOpenHoursWithBookedSlot(doctor.openHours, event),
      },
    });

    await this.updateDoctorInCache(updatedDoctor);
  }

  async updateDoctorEditableFields(
    id: number,
    body: UpdateDoctorEditableFieldsDto,
  ): Promise<Doctor> {
    const data = this.buildDoctorEditableFieldsUpdate(body);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No editable doctor fields were provided');
    }

    try {
      const updatedDoctor = await this.practitionerProfilePrisma.doctor.update({
        where: { id },
        data,
      });

      await this.updateDoctorInCache(updatedDoctor);

      return updatedDoctor;
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new NotFoundException(`Doctor ${id} was not found`);
      }

      this.logger.error(
        `Failed to update doctor ${id} in the database`,
        getErrorDetails(error),
      );

      throw new ServiceUnavailableException(
        'Unable to update doctor in the database',
      );
    }
  }

  private buildDoctorEditableFieldsUpdate(
    body: UpdateDoctorEditableFieldsDto,
  ): Prisma.DoctorUpdateInput {
    if (!isObjectRecord(body)) {
      throw new BadRequestException('Request body must be an object');
    }

    const data: Prisma.DoctorUpdateInput = {};

    if (hasOwn(body, 'address')) {
      Object.assign(data, this.buildDoctorAddressUpdate(body.address));
    }

    if (hasOwn(body, 'tags')) {
      data.speciality = readTags(body.tags);
    }

    if (hasOwn(body, 'openHours')) {
      data.openHours = readJsonValue(body.openHours);
    }

    if (hasOwn(body, 'acceptNewPatients')) {
      if (typeof body.acceptNewPatients !== 'boolean') {
        throw new BadRequestException('acceptNewPatients must be a boolean');
      }

      data.acceptNewPatients = body.acceptNewPatients;
    }

    return data;
  }

  private async updateDoctorInCache(updatedDoctor: Doctor): Promise<void> {
    const cachedDoctors =
      await this.practitionerProfileRedis.getJson<Doctor[]>(DOCTORS_CACHE_KEY);

    if (!cachedDoctors) {
      return;
    }

    let wasUpdated = false;
    const updatedDoctors = cachedDoctors.map((doctor) => {
      if (doctor.id !== updatedDoctor.id) {
        return doctor;
      }

      wasUpdated = true;

      return updatedDoctor;
    });

    if (!wasUpdated) {
      await this.practitionerProfileRedis.delete(DOCTORS_CACHE_KEY);
      return;
    }

    await this.practitionerProfileRedis.setJson(
      DOCTORS_CACHE_KEY,
      updatedDoctors,
      this.doctorsCacheTtlSeconds,
    );
  }

  private buildDoctorAddressUpdate(address: unknown): Prisma.DoctorUpdateInput {
    if (!isObjectRecord(address)) {
      throw new BadRequestException('address must be an object');
    }

    const data: Prisma.DoctorUpdateInput = {};

    for (const field of ADDRESS_FIELDS) {
      if (hasOwn(address, field)) {
        data[field] = readNullableString(address[field], `address.${field}`);
      }
    }

    return data;
  }
}
