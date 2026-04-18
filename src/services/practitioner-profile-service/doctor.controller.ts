import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';
import type { UpdateDoctorEditableFieldsDto } from './dto/update-doctor-editable-fields.dto';
import { PractitionerProfileService } from './practitioner-profile.service';

@Controller('doctors')
export class DoctorController {
  constructor(
    private readonly practitionerProfileService: PractitionerProfileService,
  ) {}

  @Get()
  findAll() {
    return this.practitionerProfileService.findDoctors();
  }

  @Get(':id/tags')
  findTags(@Param('id', ParseIntPipe) id: number) {
    return this.practitionerProfileService.findDoctorTags(id);
  }

  @Patch(':id')
  updateEditableFields(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateDoctorEditableFieldsDto,
  ) {
    return this.practitionerProfileService.updateDoctorEditableFields(id, body);
  }
}
