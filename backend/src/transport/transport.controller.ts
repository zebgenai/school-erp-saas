import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { AssignStudentDto } from './dto/assign-student.dto';
import { CreateRouteDto } from './dto/create-route.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { TransportQueryDto } from './dto/transport-query.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { TransportService } from './transport.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transport')
export class TransportController {
  constructor(private readonly transportService: TransportService) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Get('summary')
  getSummary(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.transportService.getTransportSummary(user, schoolId);
  }

  // ─── Vehicles ─────────────────────────────────────────────────────────────────

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Get('vehicles')
  findAllVehicles(@CurrentUserDecorator() user: CurrentUser, @Query() query: TransportQueryDto) {
    return this.transportService.findAllVehicles(user, query);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Get('vehicles/:id')
  findOneVehicle(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.transportService.findOneVehicle(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Post('vehicles')
  createVehicle(@Body() dto: CreateVehicleDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.transportService.createVehicle(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Patch('vehicles/:id')
  updateVehicle(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.transportService.updateVehicle(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete('vehicles/:id')
  removeVehicle(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.transportService.removeVehicle(id, user);
  }

  // ─── Routes ──────────────────────────────────────────────────────────────────

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get('routes')
  findAllRoutes(@CurrentUserDecorator() user: CurrentUser, @Query() query: TransportQueryDto) {
    return this.transportService.findAllRoutes(user, query);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get('routes/:id')
  findOneRoute(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.transportService.findOneRoute(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Post('routes')
  createRoute(@Body() dto: CreateRouteDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.transportService.createRoute(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Patch('routes/:id')
  updateRoute(
    @Param('id') id: string,
    @Body() dto: UpdateRouteDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.transportService.updateRoute(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete('routes/:id')
  removeRoute(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.transportService.removeRoute(id, user);
  }

  // ─── Student Assignments ─────────────────────────────────────────────────────

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get('assignments')
  findAllAssignments(@CurrentUserDecorator() user: CurrentUser, @Query() query: TransportQueryDto) {
    return this.transportService.findAllAssignments(user, query);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Post('assignments')
  assignStudent(@Body() dto: AssignStudentDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.transportService.assignStudent(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete('assignments/:id')
  removeAssignment(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.transportService.removeAssignment(id, user);
  }
}
