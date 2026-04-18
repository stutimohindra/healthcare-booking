import { Module } from '@nestjs/common';
import { PractitionerProfileModule } from '../practitioner-profile-service/practitioner-profile.module';
import { UserProfileController } from './user-profile.controller';
import { UserProfileService } from './user-profile.service';

@Module({
  imports: [PractitionerProfileModule],
  controllers: [UserProfileController],
  providers: [UserProfileService],
  exports: [UserProfileService],
})
export class UserProfileModule {}
