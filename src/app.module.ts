import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BookingModule } from './services/booking-service/booking.module';
import { NotificationModule } from './services/notification-service/notification.module';
import { PractitionerProfileModule } from './services/practitioner-profile-service/practitioner-profile.module';
import { UserProfileModule } from './services/user-profile-service/user-profile.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PractitionerProfileModule,
    NotificationModule,
    UserProfileModule,
    BookingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
