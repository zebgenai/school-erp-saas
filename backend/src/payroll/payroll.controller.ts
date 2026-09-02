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
import { GeneratePayrollDto } from './dto/generate-payroll.dto';
import { MarkPaidDto } from './dto/mark-paid.dto';
import { PayrollQueryDto } from './dto/payroll-query.dto';
import { UpdatePayrollDto } from './dto/update-payroll.dto';
import { PayrollService } from './payroll.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Post('generate')
  generate(@Body() dto: GeneratePayrollDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.payrollService.generate(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT)
  @Get('summary')
  getSummary(@CurrentUserDecorator() user: CurrentUser, @Query() query: PayrollQueryDto) {
    return this.payrollService.getSummary(user, query);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT)
  @Get()
  findAll(@CurrentUserDecorator() user: CurrentUser, @Query() query: PayrollQueryDto) {
    return this.payrollService.findAll(user, query);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.payrollService.findOne(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePayrollDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.payrollService.update(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT)
  @Patch(':id/mark-paid')
  markPaid(
    @Param('id') id: string,
    @Body() dto: MarkPaidDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.payrollService.markPaid(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.payrollService.cancel(id, user);
  }
}
