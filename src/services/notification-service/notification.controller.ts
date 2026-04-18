import { Body, Controller, Post } from '@nestjs/common';
import type { SendEmailDto } from './dto/send-email.dto';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('email')
  sendEmail(@Body() body: SendEmailDto) {
    return this.notificationService.sendEmail(body);
  }
}
