import { PractitionerProfileService } from './practitioner-profile.service';

describe('PractitionerProfileService', () => {
  const doctorFindUnique = jest.fn();
  const doctorUpdate = jest.fn();
  const redisGetJson = jest.fn();
  const redisSetJson = jest.fn();
  const redisDelete = jest.fn();
  let service: PractitionerProfileService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new PractitionerProfileService(
      {
        doctor: {
          findUnique: doctorFindUnique,
          update: doctorUpdate,
        },
      } as never,
      {
        getJson: redisGetJson,
        setJson: redisSetJson,
        delete: redisDelete,
      } as never,
    );
  });

  it('marks a doctor slot as booked and updates the doctor cache', async () => {
    const updatedDoctor = {
      id: 2,
      name: 'Dr. Avery',
      openHours: {
        monday: '09:00-17:00',
        bookedSlots: [
          {
            bookingId: 1,
            patientId: 1,
            tag: 'cardiology',
            slot: '2026-05-01T09:00:00.000Z',
            status: 'hold',
          },
        ],
      },
    };

    doctorFindUnique.mockResolvedValue({
      id: 2,
      openHours: {
        monday: '09:00-17:00',
      },
    });
    doctorUpdate.mockResolvedValue(updatedDoctor);
    redisGetJson.mockResolvedValue([
      {
        id: 2,
        name: 'Dr. Avery',
        openHours: {
          monday: '09:00-17:00',
        },
      },
    ]);

    await service.markDoctorSlotBooked({
      bookingId: 1,
      patientId: 1,
      doctorId: 2,
      tag: 'cardiology',
      slot: '2026-05-01T09:00:00.000Z',
      firstTimePatient: false,
      status: 'hold',
    });

    expect(doctorUpdate).toHaveBeenCalledWith({
      where: { id: 2 },
      data: {
        openHours: {
          monday: '09:00-17:00',
          bookedSlots: [
            {
              bookingId: 1,
              patientId: 1,
              tag: 'cardiology',
              slot: '2026-05-01T09:00:00.000Z',
              status: 'hold',
            },
          ],
        },
      },
    });
    expect(redisSetJson).toHaveBeenCalledWith(
      'practitioner-profile:doctors',
      [updatedDoctor],
      60,
    );
  });
});
