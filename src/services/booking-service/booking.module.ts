import { Module } from '@nestjs/common';
import { PractitionerProfileModule } from '../practitioner-profile-service/practitioner-profile.module';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

@Module({
  imports: [PractitionerProfileModule],
  controllers: [BookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
