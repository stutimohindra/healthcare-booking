import { NotFoundException } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { PractitionerProfilePrismaService } from '../practitioner-profile-service/practitioner-profile-prisma.service';
import { NotificationService } from './notification.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const createTransportMock = createTransport as jest.MockedFunction<
  typeof createTransport
>;

describe('NotificationService', () => {
  const doctorFindUnique = jest.fn();
  const patientFindUnique = jest.fn();
  const sendMail = jest.fn();
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_FROM = 'Healthcare Booking <no-reply@example.com>';

    createTransportMock.mockReturnValue({
      sendMail,
    } as never);

    sendMail.mockResolvedValue({
      messageId: 'message-1',
      accepted: ['patient@example.com'],
      rejected: [],
    });

    service = new NotificationService({
      doctor: {
        findUnique: doctorFindUnique,
      },
      patient: {
        findUnique: patientFindUnique,
      },
    } as unknown as PractitionerProfilePrismaService);
  });

  it('sends email to a user by patient id', async () => {
    patientFindUnique.mockResolvedValue({
      email: 'patient@example.com',
    });

    await service.sendEmail({
      recipientType: 'user',
      recipientId: 1,
      subject: 'Appointment reminder',
      message: 'Your appointment is tomorrow.',
    });

    expect(patientFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { email: true },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'patient@example.com',
        subject: 'Appointment reminder',
        text: 'Your appointment is tomorrow.',
      }),
    );
  });

  it('sends email to a doctor by doctor id', async () => {
    doctorFindUnique.mockResolvedValue({
      email: 'doctor@example.com',
    });

    await service.sendEmail({
      recipientType: 'doctor',
      recipientId: 2,
      subject: 'Booking changed',
      message: 'A booking was updated.',
    });

    expect(doctorFindUnique).toHaveBeenCalledWith({
      where: { id: 2 },
      select: { email: true },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'doctor@example.com',
        subject: 'Booking changed',
        text: 'A booking was updated.',
      }),
    );
  });

  it('does not send email when the user id is missing', async () => {
    patientFindUnique.mockResolvedValue(null);

    await expect(
      service.sendEmail({
        recipientType: 'user',
        recipientId: 99,
        subject: 'Appointment reminder',
        message: 'Your appointment is tomorrow.',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sends booking-created notifications to the patient and doctor', async () => {
    patientFindUnique.mockResolvedValue({
      email: 'patient@example.com',
    });
    doctorFindUnique.mockResolvedValue({
      email: 'doctor@example.com',
    });

    await service.handleBookingCreated({
      bookingId: 1,
      patientId: 1,
      doctorId: 2,
      tag: 'cardiology',
      slot: '2026-05-01T09:00:00.000Z',
      firstTimePatient: false,
      status: 'hold',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'patient@example.com',
        subject: 'Your booking is hold',
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'doctor@example.com',
        subject: 'New cardiology booking',
      }),
    );
  });
});
