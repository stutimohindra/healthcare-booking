import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { CreateUserProfileDto } from './dto/create-user-profile.dto';
import type { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UserProfileService } from './user-profile.service';

@Controller('patients')
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Post()
  createUserProfile(@Body() body: CreateUserProfileDto) {
    return this.userProfileService.createUserProfile(body);
  }

  @Get(':id')
  getUserProfile(@Param('id', ParseIntPipe) id: number) {
    return this.userProfileService.getUserProfile(id);
  }

  @Patch(':id')
  updateUserProfile(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserProfileDto,
  ) {
    return this.userProfileService.updateUserProfile(id, body);
  }
}
