import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSchoolDto } from './dto-create-school';
import { UpdateSchoolDto } from './dto-update-school';

@Injectable()
export class SchoolsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSchoolDto) {
    const existing = await this.prisma.school.findFirst({
      where: { OR: [{ slug: dto.slug }, ...(dto.domain ? [{ domain: dto.domain }] : [])] },
    });

    if (existing) {
      throw new ConflictException('School slug or domain already exists');
    }

    return this.prisma.school.create({ data: dto });
  }

  async findAll() {
    return this.prisma.school.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const school = await this.prisma.school.findUnique({ where: { id } });
    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  async update(id: string, dto: UpdateSchoolDto) {
    await this.findOne(id);
    return this.prisma.school.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.themeColor !== undefined ? { themeColor: dto.themeColor } : {}),
        ...(dto.status !== undefined ? { status: dto.status as any } : {}),
        ...(dto.emailNotificationsEnabled !== undefined
          ? { emailNotificationsEnabled: dto.emailNotificationsEnabled }
          : {}),
        ...(dto.smsNotificationsEnabled !== undefined
          ? { smsNotificationsEnabled: dto.smsNotificationsEnabled }
          : {}),
        ...(dto.whatsappNotificationsEnabled !== undefined
          ? { whatsappNotificationsEnabled: dto.whatsappNotificationsEnabled }
          : {}),
      },
    });
  }
}
