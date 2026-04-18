import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Patient, Prisma } from '@prisma/client';
import type { CreateUserProfileDto } from './dto/create-user-profile.dto';
import type { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { PractitionerProfilePrismaService } from '../practitioner-profile-service/practitioner-profile-prisma.service';

type UserProfileInput = CreateUserProfileDto | UpdateUserProfileDto;

const EDITABLE_PATIENT_FIELDS = [
  'name',
  'email',
  'phoneNo',
  'country',
  'language',
  'relatives',
  'birthDate',
  'sex',
] as const;

function hasOwn(value: object, key: string): boolean {
  return Object.hasOwn(value, key);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${fieldName} is required`);
  }

  return value.trim();
}

function readNullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException(`${fieldName} must be a string or null`);
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function readEmail(value: unknown): string {
  const email = readRequiredString(value, 'email');

  if (!isValidEmail(email)) {
    throw new BadRequestException('email must be a valid email address');
  }

  return email;
}

function readBirthDate(value: unknown): Date | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(
      'birthDate must be a date string as YYYY-MM-DD',
    );
  }

  const birthDate = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(birthDate.getTime())) {
    throw new BadRequestException('birthDate must be a valid date');
  }

  return birthDate;
}

function readJsonValue(value: unknown) {
  if (value === null) {
    return Prisma.DbNull;
  }

  return value as Prisma.InputJsonValue;
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

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class UserProfileService {
  private readonly logger = new Logger(UserProfileService.name);

  constructor(
    private readonly practitionerProfilePrisma: PractitionerProfilePrismaService,
  ) {}

  async createUserProfile(body: CreateUserProfileDto): Promise<Patient> {
    const data = this.buildCreatePatientData(body);

    try {
      return await this.practitionerProfilePrisma.patient.create({ data });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('A patient with this email already exists');
      }

      this.logger.error(
        'Failed to create patient profile',
        getErrorDetails(error),
      );

      throw new ServiceUnavailableException('Unable to create patient profile');
    }
  }

  async getUserProfile(id: number): Promise<Patient> {
    try {
      const patient = await this.practitionerProfilePrisma.patient.findUnique({
        where: { id },
      });

      if (!patient) {
        throw new NotFoundException(`Patient ${id} was not found`);
      }

      return patient;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Failed to fetch patient profile ${id}`,
        getErrorDetails(error),
      );

      throw new ServiceUnavailableException('Unable to load patient profile');
    }
  }

  async updateUserProfile(
    id: number,
    body: UpdateUserProfileDto,
  ): Promise<Patient> {
    const data = this.buildUpdatePatientData(body);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No patient profile fields were provided');
    }

    try {
      return await this.practitionerProfilePrisma.patient.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new NotFoundException(`Patient ${id} was not found`);
      }

      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('A patient with this email already exists');
      }

      this.logger.error(
        `Failed to update patient profile ${id}`,
        getErrorDetails(error),
      );

      throw new ServiceUnavailableException('Unable to update patient profile');
    }
  }

  private buildCreatePatientData(
    body: CreateUserProfileDto,
  ): Prisma.PatientCreateInput {
    this.assertPatientProfileBody(body);

    const data: Prisma.PatientCreateInput = {
      name: readRequiredString(body.name, 'name'),
      email: readEmail(body.email),
    };

    Object.assign(data, this.buildOptionalPatientData(body));

    return data;
  }

  private buildUpdatePatientData(
    body: UpdateUserProfileDto,
  ): Prisma.PatientUpdateInput {
    this.assertPatientProfileBody(body);

    const data: Prisma.PatientUpdateInput = {};

    for (const field of EDITABLE_PATIENT_FIELDS) {
      if (!hasOwn(body, field)) {
        continue;
      }

      Object.assign(data, this.readPatientField(field, body[field]));
    }

    return data;
  }

  private buildOptionalPatientData(
    body: UserProfileInput,
  ): Prisma.PatientUpdateInput {
    const data: Prisma.PatientUpdateInput = {};

    for (const field of EDITABLE_PATIENT_FIELDS) {
      if (field === 'name' || field === 'email' || !hasOwn(body, field)) {
        continue;
      }

      Object.assign(data, this.readPatientField(field, body[field]));
    }

    return data;
  }

  private assertPatientProfileBody(
    body: UserProfileInput,
  ): asserts body is UserProfileInput & Record<string, unknown> {
    if (!isObjectRecord(body)) {
      throw new BadRequestException('Request body must be an object');
    }
  }

  private readPatientField(
    field: (typeof EDITABLE_PATIENT_FIELDS)[number],
    value: unknown,
  ): Prisma.PatientUpdateInput {
    switch (field) {
      case 'name':
        return { name: readRequiredString(value, 'name') };
      case 'email':
        return { email: readEmail(value) };
      case 'phoneNo':
      case 'country':
      case 'language':
      case 'sex':
        return { [field]: readNullableString(value, field) };
      case 'relatives':
        return { relatives: readJsonValue(value) };
      case 'birthDate':
        return { birthDate: readBirthDate(value) };
    }
  }
}
