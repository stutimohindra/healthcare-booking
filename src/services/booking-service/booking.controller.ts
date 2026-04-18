import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { CreateBookingDto } from './dto/create-booking.dto';
import type { UpdateBookingDto } from './dto/update-booking.dto';
import { BookingService } from './booking.service';

@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  createBooking(@Body() body: CreateBookingDto) {
    return this.bookingService.createBooking(body);
  }

  @Patch(':id/cancel')
  cancelBooking(@Param('id', ParseIntPipe) id: number) {
    return this.bookingService.cancelBooking(id);
  }

  @Patch(':id')
  updateBooking(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateBookingDto,
  ) {
    return this.bookingService.updateBooking(id, body);
  }
}
