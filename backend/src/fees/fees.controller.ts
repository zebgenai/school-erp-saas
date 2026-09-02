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
import { CreateBulkInvoicesDto } from './dto/create-bulk-invoices.dto';
import { CreateFeeInvoiceDto } from './dto/create-fee-invoice.dto';
import { CreateFeeStructureDto } from './dto/create-fee-structure.dto';
import { FeeQueryDto } from './dto/fee-query.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { UpdateFeeStructureDto } from './dto/update-fee-structure.dto';
import { FeesService } from './fees.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('fees')
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT, UserRole.RECEPTIONIST)
  @Get('structures')
  findAllStructures(@CurrentUserDecorator() user: CurrentUser, @Query() query: FeeQueryDto) {
    return this.feesService.findAllStructures(user, query);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Post('structures')
  createStructure(
    @Body() dto: CreateFeeStructureDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.feesService.createStructure(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Patch('structures/:id')
  updateStructure(
    @Param('id') id: string,
    @Body() dto: UpdateFeeStructureDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.feesService.updateStructure(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete('structures/:id')
  removeStructure(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.feesService.removeStructure(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER, UserRole.RECEPTIONIST)
  @Get('invoices')
  findAllInvoices(@CurrentUserDecorator() user: CurrentUser, @Query() query: FeeQueryDto) {
    return this.feesService.findAllInvoices(user, query);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT)
  @Post('invoices/bulk')
  createBulkInvoices(
    @Body() dto: CreateBulkInvoicesDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.feesService.createBulkInvoices(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT)
  @Post('invoices')
  createInvoice(@Body() dto: CreateFeeInvoiceDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.feesService.createInvoice(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER, UserRole.RECEPTIONIST)
  @Get('invoices/:id')
  findOneInvoice(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.feesService.findOneInvoice(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT)
  @Post('payments')
  recordPayment(@Body() dto: RecordPaymentDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.feesService.recordPayment(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT, UserRole.RECEPTIONIST)
  @Get('reports/summary')
  getSummary(@CurrentUserDecorator() user: CurrentUser, @Query() query: FeeQueryDto) {
    return this.feesService.getSummary(user, query);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT, UserRole.RECEPTIONIST)
  @Get('reports/defaulters')
  getDefaulters(@CurrentUserDecorator() user: CurrentUser, @Query() query: FeeQueryDto) {
    return this.feesService.getDefaulters(user, query);
  }
}
