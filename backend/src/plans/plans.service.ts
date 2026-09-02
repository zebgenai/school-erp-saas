import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { subscriptions: true } } },
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
      include: { _count: { select: { subscriptions: true } } },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async create(dto: CreatePlanDto) {
    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { name: dto.name },
    });
    if (existing) throw new ConflictException('Plan name already exists');

    return this.prisma.subscriptionPlan.create({
      data: {
        name: dto.name,
        tier: dto.tier,
        priceMonthly: dto.priceMonthly ?? 0,
        priceAnnually: dto.priceAnnually ?? 0,
        maxStudents: dto.maxStudents ?? 0,
        maxTeachers: dto.maxTeachers ?? 0,
        features: dto.features ?? [],
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.findOne(id);
    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.priceMonthly !== undefined ? { priceMonthly: dto.priceMonthly } : {}),
        ...(dto.priceAnnually !== undefined ? { priceAnnually: dto.priceAnnually } : {}),
        ...(dto.maxStudents !== undefined ? { maxStudents: dto.maxStudents } : {}),
        ...(dto.maxTeachers !== undefined ? { maxTeachers: dto.maxTeachers } : {}),
        ...(dto.features !== undefined ? { features: dto.features } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(id: string) {
    const plan = await this.findOne(id);
    const subCount = await this.prisma.schoolSubscription.count({
      where: { planId: id },
    });
    if (subCount > 0) {
      throw new ConflictException(
        `Cannot delete plan "${plan.name}" — ${subCount} school(s) are using it.`,
      );
    }
    return this.prisma.subscriptionPlan.delete({ where: { id } });
  }
}
