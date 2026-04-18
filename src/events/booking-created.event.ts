export const BOOKING_CREATED_EVENT = 'booking.created';

export interface BookingCreatedEventPayload {
  bookingId: number;
  patientId: number;
  doctorId: number;
  tag: string;
  slot: string;
  firstTimePatient: boolean;
  status: string;
}
