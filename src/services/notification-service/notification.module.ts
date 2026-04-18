import { Module } from '@nestjs/common';
import { PractitionerProfileModule } from '../practitioner-profile-service/practitioner-profile.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [PractitionerProfileModule],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
