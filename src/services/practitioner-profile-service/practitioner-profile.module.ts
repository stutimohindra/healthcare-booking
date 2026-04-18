import { Module } from '@nestjs/common';
import { DoctorController } from './doctor.controller';
import { PractitionerProfilePrismaService } from './practitioner-profile-prisma.service';
import { PractitionerProfileRedisService } from './practitioner-profile-redis.service';
import { PractitionerProfileService } from './practitioner-profile.service';

@Module({
  controllers: [DoctorController],
  providers: [
    PractitionerProfilePrismaService,
    PractitionerProfileRedisService,
    PractitionerProfileService,
  ],
  exports: [PractitionerProfilePrismaService, PractitionerProfileService],
})
export class PractitionerProfileModule {}
