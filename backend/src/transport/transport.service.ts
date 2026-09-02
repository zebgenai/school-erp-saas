import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { resolvePagination } from '../common/dto/pagination-query.dto';
import { paginatedResult } from '../common/utils/paginated-result';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { AssignStudentDto } from './dto/assign-student.dto';
import { CreateRouteDto } from './dto/create-route.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { TransportQueryDto } from './dto/transport-query.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

const routeInclude = {
  vehicle: true,
  assignments: {
    include: {
      student: { select: { id: true, fullName: true, admissionNo: true, class: true, section: true } },
    },
  },
} satisfies Prisma.TransportRouteInclude;

const assignmentInclude = {
  student: { select: { id: true, fullName: true, admissionNo: true, class: true, section: true } },
  route: { include: { vehicle: true } },
} satisfies Prisma.StudentTransportInclude;

@Injectable()
export class TransportService {
  constructor(
    private prisma: PrismaService,
    private readonly notificationEngine: NotificationEngineService,
  ) {}

  // ─── Vehicles ─────────────────────────────────────────────────────────────────

  async findAllVehicles(currentUser: CurrentUser, query: TransportQueryDto) {
    const where: Prisma.VehicleWhereInput = {
      ...this.buildSchoolFilter(currentUser, query.schoolId),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    if (query.search) {
      where.OR = [
        { vehicleNo: { contains: query.search, mode: 'insensitive' } },
        { driverName: { contains: query.search, mode: 'insensitive' } },
        { model: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const { take, skip } = resolvePagination(query);
    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { vehicleNo: 'asc' },
        take,
        skip,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return paginatedResult(data, total, take, skip);
  }

  async findOneVehicle(id: string, currentUser: CurrentUser) {
    const vehicle = await this.findVehicleOrThrow(id);
    this.assertSchoolAccess(currentUser, vehicle.schoolId);
    return vehicle;
  }

  async createVehicle(dto: CreateVehicleDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    const dup = await this.prisma.vehicle.findUnique({
      where: { schoolId_vehicleNo: { schoolId, vehicleNo: dto.vehicleNo } },
    });
    if (dup) throw new BadRequestException('A vehicle with this number already exists');

    return this.prisma.vehicle.create({
      data: {
        schoolId,
        vehicleNo: dto.vehicleNo,
        type: dto.type ?? 'BUS',
        capacity: dto.capacity,
        driverName: dto.driverName,
        driverPhone: dto.driverPhone,
        model: dto.model,
        status: dto.status ?? 'ACTIVE',
      },
    });
  }

  async updateVehicle(id: string, dto: UpdateVehicleDto, currentUser: CurrentUser) {
    const vehicle = await this.findVehicleOrThrow(id);
    this.assertSchoolAccess(currentUser, vehicle.schoolId);

    if (dto.vehicleNo && dto.vehicleNo !== vehicle.vehicleNo) {
      const dup = await this.prisma.vehicle.findUnique({
        where: { schoolId_vehicleNo: { schoolId: vehicle.schoolId, vehicleNo: dto.vehicleNo } },
      });
      if (dup) throw new BadRequestException('A vehicle with this number already exists');
    }

    return this.prisma.vehicle.update({
      where: { id },
      data: {
        ...(dto.vehicleNo !== undefined ? { vehicleNo: dto.vehicleNo } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.driverName !== undefined ? { driverName: dto.driverName } : {}),
        ...(dto.driverPhone !== undefined ? { driverPhone: dto.driverPhone } : {}),
        ...(dto.model !== undefined ? { model: dto.model } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  async removeVehicle(id: string, currentUser: CurrentUser) {
    const vehicle = await this.findVehicleOrThrow(id);
    this.assertSchoolAccess(currentUser, vehicle.schoolId);

    const routeCount = await this.prisma.transportRoute.count({ where: { vehicleId: id } });
    if (routeCount > 0) {
      throw new BadRequestException(
        `Cannot delete vehicle — ${routeCount} route(s) are assigned to it. Reassign routes first.`,
      );
    }
    return this.prisma.vehicle.delete({ where: { id } });
  }

  // ─── Routes ──────────────────────────────────────────────────────────────────

  async findAllRoutes(currentUser: CurrentUser, query: TransportQueryDto) {
    const where: Prisma.TransportRouteWhereInput = {
      ...this.buildSchoolFilter(currentUser, query.schoolId),
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { startPoint: { contains: query.search, mode: 'insensitive' } },
        { endPoint: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const { take, skip } = resolvePagination(query);
    const [data, total] = await Promise.all([
      this.prisma.transportRoute.findMany({
        where,
        include: { vehicle: true },
        orderBy: { name: 'asc' },
        take,
        skip,
      }),
      this.prisma.transportRoute.count({ where }),
    ]);

    return paginatedResult(data, total, take, skip);
  }

  async findOneRoute(id: string, currentUser: CurrentUser) {
    const route = await this.findRouteOrThrow(id);
    this.assertSchoolAccess(currentUser, route.schoolId);
    return route;
  }

  async createRoute(dto: CreateRouteDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    const dup = await this.prisma.transportRoute.findUnique({
      where: { schoolId_name: { schoolId, name: dto.name } },
    });
    if (dup) throw new BadRequestException('A route with this name already exists');

    if (dto.vehicleId) {
      await this.assertVehicleBelongsToSchool(dto.vehicleId, schoolId);
    }

    return this.prisma.transportRoute.create({
      data: {
        schoolId,
        name: dto.name,
        vehicleId: dto.vehicleId,
        startPoint: dto.startPoint,
        endPoint: dto.endPoint,
        stops: dto.stops,
        fare: dto.fare,
        isActive: dto.isActive ?? true,
      },
      include: { vehicle: true },
    });
  }

  async updateRoute(id: string, dto: UpdateRouteDto, currentUser: CurrentUser) {
    const route = await this.findRouteOrThrow(id);
    this.assertSchoolAccess(currentUser, route.schoolId);

    if (dto.name && dto.name !== route.name) {
      const dup = await this.prisma.transportRoute.findUnique({
        where: { schoolId_name: { schoolId: route.schoolId, name: dto.name } },
      });
      if (dup) throw new BadRequestException('A route with this name already exists');
    }

    if (dto.vehicleId) {
      await this.assertVehicleBelongsToSchool(dto.vehicleId, route.schoolId);
    }

    return this.prisma.transportRoute.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.vehicleId !== undefined ? { vehicleId: dto.vehicleId } : {}),
        ...(dto.startPoint !== undefined ? { startPoint: dto.startPoint } : {}),
        ...(dto.endPoint !== undefined ? { endPoint: dto.endPoint } : {}),
        ...(dto.stops !== undefined ? { stops: dto.stops } : {}),
        ...(dto.fare !== undefined ? { fare: dto.fare } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: { vehicle: true },
    });
  }

  async removeRoute(id: string, currentUser: CurrentUser) {
    const route = await this.findRouteOrThrow(id);
    this.assertSchoolAccess(currentUser, route.schoolId);

    const assignCount = await this.prisma.studentTransport.count({ where: { routeId: id } });
    if (assignCount > 0) {
      throw new BadRequestException(
        `Cannot delete route — ${assignCount} student(s) are assigned to it.`,
      );
    }
    return this.prisma.transportRoute.delete({ where: { id } });
  }

  // ─── Student Assignments ─────────────────────────────────────────────────────

  async findAllAssignments(currentUser: CurrentUser, query: TransportQueryDto) {
    const where: Prisma.StudentTransportWhereInput = {
      ...this.buildSchoolFilter(currentUser, query.schoolId),
      ...(query.routeId ? { routeId: query.routeId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const { take, skip } = resolvePagination(query);
    const [data, total] = await Promise.all([
      this.prisma.studentTransport.findMany({
        where,
        include: assignmentInclude,
        orderBy: { createdAt: 'asc' },
        take,
        skip,
      }),
      this.prisma.studentTransport.count({ where }),
    ]);

    return paginatedResult(data, total, take, skip);
  }

  async assignStudent(dto: AssignStudentDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    const student = await this.prisma.student.findUnique({ where: { id: dto.studentId } });
    if (!student) throw new NotFoundException('Student not found');
    if (student.schoolId !== schoolId) throw new ForbiddenException('Student does not belong to this school');

    const existing = await this.prisma.studentTransport.findUnique({
      where: { studentId: dto.studentId },
    });
    if (existing) throw new BadRequestException('Student is already assigned to a transport route');

    await this.assertRouteBelongsToSchool(dto.routeId, schoolId);

    const assignment = await this.prisma.studentTransport.create({
      data: {
        schoolId,
        studentId: dto.studentId,
        routeId: dto.routeId,
        pickupPoint: dto.pickupPoint,
        dropPoint: dto.dropPoint,
        monthlyFee: dto.monthlyFee ?? 0,
      },
      include: assignmentInclude,
    });

    this.notificationEngine.dispatch(async () => {
      const route = await this.prisma.transportRoute.findUnique({ where: { id: dto.routeId } });
      await this.notificationEngine.emitTransportAssignmentChanged(
        schoolId,
        dto.studentId,
        route?.name ?? 'Route',
      );
    });

    return assignment;
  }

  async removeAssignment(id: string, currentUser: CurrentUser) {
    const assignment = await this.prisma.studentTransport.findUnique({
      where: { id },
      include: assignmentInclude,
    });
    if (!assignment) throw new NotFoundException('Transport assignment not found');
    this.assertSchoolAccess(currentUser, assignment.schoolId);
    return this.prisma.studentTransport.delete({ where: { id } });
  }

  async getTransportSummary(currentUser: CurrentUser, schoolId?: string) {
    const filter = this.buildSchoolFilter(currentUser, schoolId);

    const [totalVehicles, activeVehicles, totalRoutes, activeRoutes, totalStudents] = await Promise.all([
      this.prisma.vehicle.count({ where: filter }),
      this.prisma.vehicle.count({ where: { ...filter, status: 'ACTIVE' } }),
      this.prisma.transportRoute.count({ where: filter }),
      this.prisma.transportRoute.count({ where: { ...filter, isActive: true } }),
      this.prisma.studentTransport.count({ where: { ...filter, status: 'ACTIVE' } }),
    ]);

    return { totalVehicles, activeVehicles, totalRoutes, activeRoutes, totalStudents };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async findVehicleOrThrow(id: string) {
    const v = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!v) throw new NotFoundException('Vehicle not found');
    return v;
  }

  private async findRouteOrThrow(id: string) {
    const r = await this.prisma.transportRoute.findUnique({ where: { id }, include: { vehicle: true } });
    if (!r) throw new NotFoundException('Route not found');
    return r;
  }

  private async assertVehicleBelongsToSchool(vehicleId: string, schoolId: string) {
    const v = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!v) throw new NotFoundException('Vehicle not found');
    if (v.schoolId !== schoolId) throw new ForbiddenException('Vehicle does not belong to this school');
  }

  private async assertRouteBelongsToSchool(routeId: string, schoolId: string) {
    const r = await this.prisma.transportRoute.findUnique({ where: { id: routeId } });
    if (!r) throw new NotFoundException('Route not found');
    if (r.schoolId !== schoolId) throw new ForbiddenException('Route does not belong to this school');
  }

  private resolveSchoolId(currentUser: CurrentUser, schoolId?: string): string {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (!schoolId) throw new BadRequestException('schoolId is required');
      return schoolId;
    }
    if (!currentUser.schoolId) throw new ForbiddenException('School context missing');
    if (schoolId && schoolId !== currentUser.schoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }
    return currentUser.schoolId;
  }

  private buildSchoolFilter(currentUser: CurrentUser, schoolId?: string) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return schoolId ? { schoolId } : {};
    }
    if (!currentUser.schoolId) throw new ForbiddenException('School context missing');
    if (schoolId && schoolId !== currentUser.schoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }
    return { schoolId: currentUser.schoolId };
  }

  private assertSchoolAccess(currentUser: CurrentUser, resourceSchoolId: string) {
    if (currentUser.role === UserRole.SUPER_ADMIN) return;
    if (!currentUser.schoolId) throw new ForbiddenException('School context missing');
    if (currentUser.schoolId !== resourceSchoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }
  }
}
