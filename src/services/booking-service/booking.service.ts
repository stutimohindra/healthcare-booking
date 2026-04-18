import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Booking, Prisma } from '@prisma/client';
import {
  BOOKING_CREATED_EVENT,
  type BookingCreatedEventPayload,
} from '../../events/booking-created.event';
import { PractitionerProfilePrismaService } from '../practitioner-profile-service/practitioner-profile-prisma.service';
import type { CreateBookingDto } from './dto/create-booking.dto';
import type { UpdateBookingDto } from './dto/update-booking.dto';

type BookingStatus = 'hold' | 'booked' | 'cancelled';

type BookingForUpdate = Pick<Booking, 'id' | 'doctorId' | 'tag'>;

const DEFAULT_BOOKING_STATUS: BookingStatus = 'hold';

function readPositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value === 'string' && value.trim().length === 0) {
    throw new BadRequestException(`${fieldName} must be a positive integer`);
  }

  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(`${fieldName} must be a positive integer`);
  }

  return parsed;
}

function hasOwn(value: object, key: string): boolean {
  return Object.hasOwn(value, key);
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${fieldName} is required`);
  }

  return value.trim();
}

function readSlot(value: unknown): Date {
  const slot = readRequiredString(value, 'slot');
  const parsedSlot = new Date(slot);

  if (Number.isNaN(parsedSlot.getTime())) {
    throw new BadRequestException('slot must be a valid date time');
  }

  return parsedSlot;
}

function readOptionalBoolean(
  value: unknown,
  fieldName: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new BadRequestException(`${fieldName} must be a boolean`);
  }

  return value;
}

function readStatus(value: unknown): BookingStatus {
  if (value === undefined) {
    return DEFAULT_BOOKING_STATUS;
  }

  const status = readRequiredString(value, 'status');

  if (status !== 'hold' && status !== 'booked' && status !== 'cancelled') {
    throw new BadRequestException('status must be hold, booked, or cancelled');
  }

  return status;
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

function getErrorDetails(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function isRecordNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}

function toBookingCreatedEvent(booking: Booking): BookingCreatedEventPayload {
  return {
    bookingId: booking.id,
    patientId: booking.patientId,
    doctorId: booking.doctorId,
    tag: booking.tag,
    slot:
      booking.slot instanceof Date
        ? booking.slot.toISOString()
        : String(booking.slot),
    firstTimePatient: booking.firstTimePatient,
    status: booking.status,
  };
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PractitionerProfilePrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createBooking(body: CreateBookingDto): Promise<Booking> {
    try {
      const data = await this.buildCreateBookingData(body);
      const booking = await this.prisma.booking.create({ data });

      this.eventEmitter.emit(
        BOOKING_CREATED_EVENT,
        toBookingCreatedEvent(booking),
      );

      return booking;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      this.logger.error('Failed to create booking', getErrorDetails(error));

      throw new ServiceUnavailableException('Unable to create booking');
    }
  }

  async updateBooking(id: number, body: UpdateBookingDto): Promise<Booking> {
    try {
      const data = await this.buildUpdateBookingData(id, body);

      return await this.prisma.booking.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      if (isRecordNotFound(error)) {
        throw new NotFoundException(`Booking ${id} was not found`);
      }

      this.logger.error(
        `Failed to update booking ${id}`,
        getErrorDetails(error),
      );

      throw new ServiceUnavailableException('Unable to update booking');
    }
  }

  async cancelBooking(id: number): Promise<Booking> {
    try {
      return await this.prisma.booking.update({
        where: { id },
        data: {
          status: 'cancelled',
        },
      });
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new NotFoundException(`Booking ${id} was not found`);
      }

      this.logger.error(
        `Failed to cancel booking ${id}`,
        getErrorDetails(error),
      );

      throw new ServiceUnavailableException('Unable to cancel booking');
    }
  }

  private async buildCreateBookingData(
    body: CreateBookingDto,
  ): Promise<Prisma.BookingCreateInput> {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BadRequestException('Request body must be an object');
    }

    const patientId = readPositiveInteger(body.patientId, 'patientId');
    const doctorId = readPositiveInteger(body.doctorId, 'doctorId');
    const tag = readRequiredString(body.tag, 'tag');
    const slot = readSlot(body.slot);
    const firstTimePatient = readOptionalBoolean(
      body.firstTimePatient,
      'firstTimePatient',
    );
    const status = readStatus(body.status);

    await this.assertPatientExists(patientId);
    await this.assertDoctorCanBookTag(doctorId, tag);

    const data: Prisma.BookingCreateInput = {
      patient: {
        connect: { id: patientId },
      },
      doctor: {
        connect: { id: doctorId },
      },
      tag,
      slot,
      status,
    };

    if (firstTimePatient !== undefined) {
      data.firstTimePatient = firstTimePatient;
    }

    return data;
  }

  private async buildUpdateBookingData(
    id: number,
    body: UpdateBookingDto,
  ): Promise<Prisma.BookingUpdateInput> {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BadRequestException('Request body must be an object');
    }

    const existingBooking = await this.getBookingForUpdate(id);
    const data: Prisma.BookingUpdateInput = {};
    let doctorId = existingBooking.doctorId;
    let tag = existingBooking.tag;
    let shouldValidateDoctorTag = false;

    if (hasOwn(body, 'patientId')) {
      const patientId = readPositiveInteger(body.patientId, 'patientId');

      await this.assertPatientExists(patientId);

      data.patient = {
        connect: { id: patientId },
      };
    }

    if (hasOwn(body, 'doctorId')) {
      doctorId = readPositiveInteger(body.doctorId, 'doctorId');
      shouldValidateDoctorTag = true;
      data.doctor = {
        connect: { id: doctorId },
      };
    }

    if (hasOwn(body, 'tag')) {
      tag = readRequiredString(body.tag, 'tag');
      shouldValidateDoctorTag = true;
      data.tag = tag;
    }

    if (hasOwn(body, 'slot')) {
      data.slot = readSlot(body.slot);
    }

    if (hasOwn(body, 'firstTimePatient')) {
      data.firstTimePatient = readOptionalBoolean(
        body.firstTimePatient,
        'firstTimePatient',
      );
    }

    if (hasOwn(body, 'status')) {
      data.status = readStatus(body.status);
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No booking fields were provided');
    }

    if (shouldValidateDoctorTag) {
      await this.assertDoctorCanBookTag(doctorId, tag);
    }

    return data;
  }

  private async getBookingForUpdate(id: number): Promise<BookingForUpdate> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      select: {
        id: true,
        doctorId: true,
        tag: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${id} was not found`);
    }

    return booking;
  }

  private async assertPatientExists(patientId: number): Promise<void> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundException(`Patient ${patientId} was not found`);
    }
  }

  private async assertDoctorCanBookTag(
    doctorId: number,
    selectedTag: string,
  ): Promise<void> {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      select: {
        id: true,
        speciality: true,
      },
    });

    if (!doctor) {
      throw new NotFoundException(`Doctor ${doctorId} was not found`);
    }

    const tags = splitTags(doctor.speciality);

    if (!tags.includes(selectedTag)) {
      throw new BadRequestException(
        `Doctor ${doctorId} does not have tag ${selectedTag}`,
      );
    }
  }
}
