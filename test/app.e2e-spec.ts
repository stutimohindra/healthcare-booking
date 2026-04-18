import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { BOOKING_CREATED_EVENT } from './../src/events/booking-created.event';
import { NotificationService } from './../src/services/notification-service/notification.service';
import { PractitionerProfilePrismaService } from './../src/services/practitioner-profile-service/practitioner-profile-prisma.service';
import { PractitionerProfileRedisService } from './../src/services/practitioner-profile-service/practitioner-profile-redis.service';

const doctorFindMany = jest.fn();
const doctorFindUnique = jest.fn();
const doctorUpdate = jest.fn();
const bookingCreate = jest.fn();
const bookingFindUnique = jest.fn();
const bookingUpdate = jest.fn();
const patientCreate = jest.fn();
const patientFindUnique = jest.fn();
const patientUpdate = jest.fn();
const sendEmail = jest.fn();
const redisGetJson = jest.fn();
const redisSetJson = jest.fn();
const redisDelete = jest.fn();
const eventEmit = jest.fn();
const eventOn = jest.fn();
const eventPrependListener = jest.fn();
const eventRemoveAllListeners = jest.fn();

const prismaMock = {
  doctor: {
    findMany: doctorFindMany,
    findUnique: doctorFindUnique,
    update: doctorUpdate,
  },
  booking: {
    create: bookingCreate,
    findUnique: bookingFindUnique,
    update: bookingUpdate,
  },
  patient: {
    create: patientCreate,
    findUnique: patientFindUnique,
    update: patientUpdate,
  },
  $disconnect: jest.fn(),
};

const redisMock = {
  getJson: redisGetJson,
  setJson: redisSetJson,
  delete: redisDelete,
};

const notificationMock = {
  sendEmail,
};

const eventEmitterMock = {
  emit: eventEmit,
  on: eventOn,
  prependListener: eventPrependListener,
  removeAllListeners: eventRemoveAllListeners,
};

function expectErrorMessage(response: Response, message: string): void {
  const body = response.body as { message?: unknown };

  expect(body.message).toBe(message);
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PractitionerProfilePrismaService)
      .useValue(prismaMock)
      .overrideProvider(PractitionerProfileRedisService)
      .useValue(redisMock)
      .overrideProvider(NotificationService)
      .useValue(notificationMock)
      .overrideProvider(EventEmitter2)
      .useValue(eventEmitterMock)
      .compile();

    jest.clearAllMocks();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/notifications/email (POST) sends an email notification', async () => {
    const payload = {
      recipientType: 'user',
      recipientId: 1,
      subject: 'Appointment reminder',
      message: 'Your appointment is tomorrow at 09:00.',
    };
    const result = {
      messageId: 'message-1',
      accepted: ['patient@example.com'],
      rejected: [],
    };

    sendEmail.mockResolvedValue(result);

    await request(app.getHttpServer())
      .post('/notifications/email')
      .send(payload)
      .expect(201)
      .expect(result);

    expect(sendEmail).toHaveBeenCalledWith(payload);
  });

  it('/patients (POST) creates a patient profile', async () => {
    const payload = {
      name: 'Avery Patient',
      email: 'avery@example.com',
      phoneNo: '+49123456789',
      country: 'Germany',
      language: 'English',
      relatives: [
        {
          name: 'Jordan Patient',
          relationship: 'spouse',
          phoneNo: '+49987654321',
        },
      ],
      birthDate: '1990-01-15',
      sex: 'female',
    };
    const patient = {
      id: 1,
      ...payload,
      createdAt: null,
      updatedAt: null,
    };

    patientCreate.mockResolvedValue(patient);

    await request(app.getHttpServer())
      .post('/patients')
      .send(payload)
      .expect(201)
      .expect(patient);

    expect(patientCreate).toHaveBeenCalledWith({
      data: {
        name: 'Avery Patient',
        email: 'avery@example.com',
        phoneNo: '+49123456789',
        country: 'Germany',
        language: 'English',
        relatives: payload.relatives,
        birthDate: new Date('1990-01-15T00:00:00.000Z'),
        sex: 'female',
      },
    });
  });

  it('/patients/:id (GET) returns a patient profile', async () => {
    const patient = {
      id: 1,
      name: 'Avery Patient',
      email: 'avery@example.com',
      phoneNo: '+49123456789',
      country: 'Germany',
      language: 'English',
      relatives: null,
      birthDate: null,
      sex: 'female',
      createdAt: null,
      updatedAt: null,
    };

    patientFindUnique.mockResolvedValue(patient);

    await request(app.getHttpServer())
      .get('/patients/1')
      .expect(200)
      .expect(patient);

    expect(patientFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });

  it('/patients/:id (PATCH) edits all patient profile fields', async () => {
    const payload = {
      name: 'Avery Updated',
      email: 'avery.updated@example.com',
      phoneNo: '+49111111111',
      country: 'Netherlands',
      language: 'Dutch',
      relatives: [
        {
          name: 'Morgan Patient',
          relationship: 'sibling',
        },
      ],
      birthDate: '1991-02-20',
      sex: 'nonbinary',
    };
    const patient = {
      id: 1,
      ...payload,
      createdAt: null,
      updatedAt: null,
    };

    patientUpdate.mockResolvedValue(patient);

    await request(app.getHttpServer())
      .patch('/patients/1')
      .send(payload)
      .expect(200)
      .expect(patient);

    expect(patientUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        name: 'Avery Updated',
        email: 'avery.updated@example.com',
        phoneNo: '+49111111111',
        country: 'Netherlands',
        language: 'Dutch',
        relatives: payload.relatives,
        birthDate: new Date('1991-02-20T00:00:00.000Z'),
        sex: 'nonbinary',
      },
    });
  });

  it('/bookings (POST) creates a patient booking with doctor tag and slot', async () => {
    const payload = {
      patientId: 1,
      doctorId: 2,
      tag: 'cardiology',
      slot: '2026-05-01T09:00:00.000Z',
    };
    const booking = {
      id: 1,
      patientId: 1,
      doctorId: 2,
      tag: 'cardiology',
      slot: payload.slot,
      firstTimePatient: false,
      status: 'hold',
      createdAt: null,
      updatedAt: null,
    };

    patientFindUnique.mockResolvedValue({ id: 1 });
    doctorFindUnique.mockResolvedValue({
      id: 2,
      speciality: 'cardiology, pediatrics',
    });
    bookingCreate.mockResolvedValue(booking);

    await request(app.getHttpServer())
      .post('/bookings')
      .send(payload)
      .expect(201)
      .expect(booking);

    expect(patientFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { id: true },
    });
    expect(doctorFindUnique).toHaveBeenCalledWith({
      where: { id: 2 },
      select: {
        id: true,
        speciality: true,
      },
    });
    expect(bookingCreate).toHaveBeenCalledWith({
      data: {
        patient: {
          connect: { id: 1 },
        },
        doctor: {
          connect: { id: 2 },
        },
        tag: 'cardiology',
        slot: new Date('2026-05-01T09:00:00.000Z'),
        status: 'hold',
      },
    });
    expect(eventEmit).toHaveBeenCalledWith(BOOKING_CREATED_EVENT, {
      bookingId: 1,
      patientId: 1,
      doctorId: 2,
      tag: 'cardiology',
      slot: '2026-05-01T09:00:00.000Z',
      firstTimePatient: false,
      status: 'hold',
    });
  });

  it('/bookings (POST) rejects tags the doctor does not have', async () => {
    patientFindUnique.mockResolvedValue({ id: 1 });
    doctorFindUnique.mockResolvedValue({
      id: 2,
      speciality: 'cardiology, pediatrics',
    });

    await request(app.getHttpServer())
      .post('/bookings')
      .send({
        patientId: 1,
        doctorId: 2,
        tag: 'dermatology',
        slot: '2026-05-01T09:00:00.000Z',
      })
      .expect(400)
      .expect((response) =>
        expectErrorMessage(response, 'Doctor 2 does not have tag dermatology'),
      );

    expect(bookingCreate).not.toHaveBeenCalled();
  });

  it('/bookings/:id (PATCH) updates booking doctor, tag, slot, and status', async () => {
    const payload = {
      doctorId: 3,
      tag: 'dermatology',
      slot: '2026-05-02T10:30:00.000Z',
      firstTimePatient: true,
      status: 'booked',
    };
    const booking = {
      id: 1,
      patientId: 1,
      doctorId: 3,
      tag: 'dermatology',
      slot: payload.slot,
      firstTimePatient: true,
      status: 'booked',
      createdAt: null,
      updatedAt: null,
    };

    bookingFindUnique.mockResolvedValue({
      id: 1,
      doctorId: 2,
      tag: 'cardiology',
    });
    doctorFindUnique.mockResolvedValue({
      id: 3,
      speciality: 'dermatology, pediatrics',
    });
    bookingUpdate.mockResolvedValue(booking);

    await request(app.getHttpServer())
      .patch('/bookings/1')
      .send(payload)
      .expect(200)
      .expect(booking);

    expect(bookingFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: {
        id: true,
        doctorId: true,
        tag: true,
      },
    });
    expect(doctorFindUnique).toHaveBeenCalledWith({
      where: { id: 3 },
      select: {
        id: true,
        speciality: true,
      },
    });
    expect(bookingUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        doctor: {
          connect: { id: 3 },
        },
        tag: 'dermatology',
        slot: new Date('2026-05-02T10:30:00.000Z'),
        firstTimePatient: true,
        status: 'booked',
      },
    });
  });

  it('/bookings/:id/cancel (PATCH) cancels a booking', async () => {
    const booking = {
      id: 1,
      patientId: 1,
      doctorId: 2,
      tag: 'cardiology',
      slot: '2026-05-01T09:00:00.000Z',
      firstTimePatient: false,
      status: 'cancelled',
      createdAt: null,
      updatedAt: null,
    };

    bookingUpdate.mockResolvedValue(booking);

    await request(app.getHttpServer())
      .patch('/bookings/1/cancel')
      .expect(200)
      .expect(booking);

    expect(bookingUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        status: 'cancelled',
      },
    });
  });

  it('/doctors (GET) returns doctors from Redis cache', async () => {
    const cachedDoctors = [
      {
        id: 1,
        name: 'Dr. Cache',
        speciality: 'cardiology',
        acceptNewPatients: true,
      },
    ];

    redisGetJson.mockResolvedValue(cachedDoctors);

    await request(app.getHttpServer())
      .get('/doctors')
      .expect(200)
      .expect(cachedDoctors);

    expect(redisGetJson).toHaveBeenCalledWith('practitioner-profile:doctors');
    expect(doctorFindMany).not.toHaveBeenCalled();
    expect(redisSetJson).not.toHaveBeenCalled();
  });

  it('/doctors (GET) caches doctors from the database on cache miss', async () => {
    const doctors = [
      {
        id: 1,
        name: 'Dr. Database',
        speciality: 'family medicine',
        acceptNewPatients: true,
      },
    ];

    redisGetJson.mockResolvedValue(null);
    doctorFindMany.mockResolvedValue(doctors);

    await request(app.getHttpServer())
      .get('/doctors')
      .expect(200)
      .expect(doctors);

    expect(redisGetJson).toHaveBeenCalledWith('practitioner-profile:doctors');
    expect(doctorFindMany).toHaveBeenCalledWith({
      orderBy: {
        createdAt: 'desc',
      },
    });
    expect(redisSetJson).toHaveBeenCalledWith(
      'practitioner-profile:doctors',
      doctors,
      60,
    );
  });

  it('/doctors/:id/tags (GET) returns doctor tags from Redis cache', async () => {
    const cachedDoctors = [
      {
        id: 1,
        name: 'Dr. Cache',
        speciality: 'family medicine, telehealth',
      },
    ];

    redisGetJson.mockResolvedValue(cachedDoctors);

    await request(app.getHttpServer())
      .get('/doctors/1/tags')
      .expect(200)
      .expect({
        doctorId: 1,
        tags: ['family medicine', 'telehealth'],
      });

    expect(redisGetJson).toHaveBeenCalledWith('practitioner-profile:doctors');
    expect(doctorFindUnique).not.toHaveBeenCalled();
  });

  it('/doctors/:id/tags (GET) returns doctor tags from the database', async () => {
    redisGetJson.mockResolvedValue(null);
    doctorFindUnique.mockResolvedValue({
      id: 1,
      speciality: 'cardiology, pediatrics',
    });

    await request(app.getHttpServer())
      .get('/doctors/1/tags')
      .expect(200)
      .expect({
        doctorId: 1,
        tags: ['cardiology', 'pediatrics'],
      });

    expect(redisGetJson).toHaveBeenCalledWith('practitioner-profile:doctors');
    expect(doctorFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: {
        id: true,
        speciality: true,
      },
    });
  });

  it('/doctors/:id (PATCH) updates address, tags, openHours, and acceptNewPatients', async () => {
    const payload = {
      address: {
        street: '123 Main Street',
        postalCode: '10115',
        city: 'Berlin',
        country: 'Germany',
        addressExtra: null,
      },
      tags: ['family medicine', 'telehealth'],
      openHours: {
        monday: '09:00-17:00',
        tuesday: '09:00-17:00',
      },
      acceptNewPatients: false,
    };
    const updatedDoctor = {
      id: 1,
      name: 'Dr. Jane Smith',
      clinicName: null,
      openHours: payload.openHours,
      speciality: 'family medicine, telehealth',
      description: null,
      spokenLanguages: null,
      feeType: null,
      website: null,
      picture: null,
      contactNumber: null,
      faxNumber: null,
      acceptNewPatients: false,
      street: '123 Main Street',
      postalCode: '10115',
      city: 'Berlin',
      country: 'Germany',
      addressExtra: null,
      transportation: null,
      additionalInfo: null,
      createdAt: null,
      updatedAt: null,
    };
    const cachedDoctors = [
      {
        ...updatedDoctor,
        name: 'Dr. Old Name',
        speciality: 'old speciality',
      },
      {
        ...updatedDoctor,
        id: 2,
        name: 'Dr. Other',
      },
    ];

    doctorUpdate.mockResolvedValue(updatedDoctor);
    redisGetJson.mockResolvedValue(cachedDoctors);

    await request(app.getHttpServer())
      .patch('/doctors/1')
      .send(payload)
      .expect(200)
      .expect(updatedDoctor);

    expect(doctorUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        street: '123 Main Street',
        postalCode: '10115',
        city: 'Berlin',
        country: 'Germany',
        addressExtra: null,
        speciality: 'family medicine, telehealth',
        openHours: payload.openHours,
        acceptNewPatients: false,
      },
    });
    expect(redisSetJson).toHaveBeenCalledWith(
      'practitioner-profile:doctors',
      [updatedDoctor, cachedDoctors[1]],
      60,
    );
    expect(redisDelete).not.toHaveBeenCalled();
  });

  it('/doctors/:id (PATCH) rejects invalid acceptNewPatients values', async () => {
    await request(app.getHttpServer())
      .patch('/doctors/1')
      .send({ acceptNewPatients: 'false' })
      .expect(400)
      .expect((response) =>
        expectErrorMessage(response, 'acceptNewPatients must be a boolean'),
      );

    expect(doctorUpdate).not.toHaveBeenCalled();
  });

  it('/doctors/:id (PATCH) rejects empty patch bodies', async () => {
    await request(app.getHttpServer())
      .patch('/doctors/1')
      .send({})
      .expect(400)
      .expect((response) =>
        expectErrorMessage(response, 'No editable doctor fields were provided'),
      );

    expect(doctorUpdate).not.toHaveBeenCalled();
  });

  afterEach(async () => {
    await app.close();
  });
});
