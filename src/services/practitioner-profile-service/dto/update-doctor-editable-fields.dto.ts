export interface DoctorAddressUpdateDto {
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  addressExtra?: string | null;
}

export interface UpdateDoctorEditableFieldsDto {
  address?: DoctorAddressUpdateDto;
  tags?: string | string[] | null;
  openHours?: unknown;
  acceptNewPatients?: boolean;
}
