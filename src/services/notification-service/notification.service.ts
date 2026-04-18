import 'dotenv/config';

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  createTransport,
  type SendMailOptions,
  type Transporter,
} from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import {
  BOOKING_CREATED_EVENT,
  type BookingCreatedEventPayload,
} from '../../events/booking-created.event';
import { PractitionerProfilePrismaService } from '../practitioner-profile-service/practitioner-profile-prisma.service';
import type { SendEmailDto } from './dto/send-email.dto';

export interface SendEmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

type RecipientType = 'patient' | 'doctor';

interface ValidatedEmailInput {
  recipientType: RecipientType;
  recipientId: number;
  subject: string;
  message: string;
}

const DEFAULT_SMTP_PORT = 587;

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${fieldName} is required`);
  }

  return value.trim();
}

function readRecipientType(value: unknown): RecipientType {
  const recipientType = readRequiredString(
    value,
    'recipientType',
  ).toLowerCase();

  if (recipientType === 'user' || recipientType === 'patient') {
    return 'patient';
  }

  if (recipientType === 'doctor') {
    return 'doctor';
  }

  throw new BadRequestException('recipientType must be user or doctor');
}

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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getPositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getBoolean(value: string | undefined): boolean {
  return value === 'true';
}

function getAddressList(
  addresses: Array<string | { address: string }>,
): string[] {
  return addresses.map((address) =>
    typeof address === 'string' ? address : address.address,
  );
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private transporter?: Transporter<SMTPTransport.SentMessageInfo>;

  constructor(private readonly prisma: PractitionerProfilePrismaService) {}

  @OnEvent(BOOKING_CREATED_EVENT, { async: true })
  async handleBookingCreated(event: BookingCreatedEventPayload): Promise<void> {
    await Promise.all([
      this.sendBookingCreatedNotification(
        'patient',
        event.patientId,
        `Your booking is ${event.status}`,
        `Your ${event.tag} booking is scheduled for ${event.slot}.`,
        event,
      ),
      this.sendBookingCreatedNotification(
        'doctor',
        event.doctorId,
        `New ${event.tag} booking`,
        `A patient booked ${event.tag} for ${event.slot}.`,
        event,
      ),
    ]);
  }

  async sendEmail(body: SendEmailDto): Promise<SendEmailResult> {
    const input = this.validateSendEmailBody(body);
    const recipientEmail = await this.resolveRecipientEmail(input);
    const transporter = this.getTransporter();

    const mailOptions: SendMailOptions = {
      from: this.getSenderAddress(),
      to: recipientEmail,
      subject: input.subject,
      text: input.message,
    };

    try {
      const info = await transporter.sendMail(mailOptions);

      return {
        messageId: info.messageId,
        accepted: getAddressList(info.accepted),
        rejected: getAddressList(info.rejected),
      };
    } catch (error) {
      this.logger.error(
        `Failed to send notification email to ${input.recipientType}:${input.recipientId}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new ServiceUnavailableException('Unable to send email');
    }
  }

  private async sendBookingCreatedNotification(
    recipientType: RecipientType,
    recipientId: number,
    subject: string,
    message: string,
    event: BookingCreatedEventPayload,
  ): Promise<void> {
    try {
      await this.sendEmail({
        recipientType,
        recipientId,
        subject,
        message,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send booking ${event.bookingId} notification to ${recipientType}:${recipientId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private validateSendEmailBody(body: SendEmailDto): ValidatedEmailInput {
    return {
      recipientType: readRecipientType(body.recipientType),
      recipientId: readPositiveInteger(body.recipientId, 'recipientId'),
      subject: readRequiredString(body.subject, 'subject'),
      message: readRequiredString(body.message, 'message'),
    };
  }

  private async resolveRecipientEmail(
    input: ValidatedEmailInput,
  ): Promise<string> {
    try {
      if (input.recipientType === 'doctor') {
        return await this.resolveDoctorEmail(input.recipientId);
      }

      return await this.resolvePatientEmail(input.recipientId);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      this.logger.error(
        `Failed to load notification recipient ${input.recipientType}:${input.recipientId}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new ServiceUnavailableException(
        'Unable to load notification recipient',
      );
    }
  }

  private async resolvePatientEmail(patientId: number): Promise<string> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { email: true },
    });

    if (!patient) {
      throw new NotFoundException('User not found');
    }

    const email = patient.email.trim();

    if (!isValidEmail(email)) {
      throw new BadRequestException('User email must be a valid email address');
    }

    return email;
  }

  private async resolveDoctorEmail(doctorId: number): Promise<string> {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      select: { email: true },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    const email = doctor.email?.trim();

    if (!email) {
      throw new BadRequestException('Doctor does not have an email address');
    }

    if (!isValidEmail(email)) {
      throw new BadRequestException(
        'Doctor email must be a valid email address',
      );
    }

    return email;
  }

  private getTransporter(): Transporter<SMTPTransport.SentMessageInfo> {
    if (this.transporter) {
      return this.transporter;
    }

    const host = process.env.SMTP_HOST;

    if (!host) {
      throw new ServiceUnavailableException('SMTP_HOST is not configured');
    }

    this.transporter = createTransport({
      host,
      port: getPositiveInteger(process.env.SMTP_PORT, DEFAULT_SMTP_PORT),
      secure: getBoolean(process.env.SMTP_SECURE),
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASSWORD
          ? {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASSWORD,
            }
          : undefined,
    });

    return this.transporter;
  }

  private getSenderAddress(): string {
    const sender = process.env.SMTP_FROM ?? process.env.SMTP_USER;

    if (!sender) {
      throw new ServiceUnavailableException('SMTP_FROM is not configured');
    }

    return sender;
  }
}
