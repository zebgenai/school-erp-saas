import { ConflictException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import * as fsSync from 'fs';
import * as path from 'path';
import {
  allocateUniqueSchoolSlug,
  schoolTenantDomain,
} from '../common/tenant/school-slug';
import { resolveUploadDiskPath } from '../common/utils/upload-path';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSchoolDto } from './dto-create-school';
import { UpdateSchoolDto } from './dto-update-school';
import { toPublicSchoolBranding } from './public-school-branding';

@Injectable()
export class SchoolsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSchoolDto) {
    const slug = await allocateUniqueSchoolSlug(dto.name, (candidate) =>
      this.schoolSlugOrDomainTaken(candidate),
    );
    const domain = schoolTenantDomain(slug);

    const existingName = await this.prisma.school.findFirst({
      where: { name: dto.name },
      select: { id: true },
    });
    if (existingName) {
      throw new ConflictException(`School "${dto.name}" already exists`);
    }

    return this.prisma.school.create({
      data: {
        name: dto.name,
        slug,
        domain,
        ownerName: dto.ownerName,
        address: dto.address,
        phone: dto.phone,
        email: dto.email,
        logoUrl: dto.logoUrl,
        themeColor: dto.themeColor,
      },
    });
  }

  private async schoolSlugOrDomainTaken(slug: string): Promise<boolean> {
    const found = await this.prisma.school.findFirst({
      where: { OR: [{ slug }, { domain: schoolTenantDomain(slug) }] },
      select: { id: true },
    });
    return Boolean(found);
  }

  async findAll() {
    return this.prisma.school.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const school = await this.prisma.school.findUnique({ where: { id } });
    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  async findPublicBranding(slug: string) {
    const school = await this.prisma.school.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        themeColor: true,
        status: true,
      },
    });
    const branding = school ? toPublicSchoolBranding(school) : null;
    if (!branding) throw new NotFoundException('School not found');
    return branding;
  }

  async streamPublicLogo(slug: string) {
    const school = await this.prisma.school.findUnique({
      where: { slug },
      select: { logoUrl: true, status: true },
    });
    if (!school || school.status !== 'ACTIVE' || !school.logoUrl) {
      throw new NotFoundException('School logo not found');
    }
    if (/^https?:\/\//i.test(school.logoUrl)) {
      throw new NotFoundException('School logo not found');
    }
    const diskPath = resolveUploadDiskPath(school.logoUrl);
    if (!diskPath) throw new NotFoundException('School logo not found');
    const ext = path.extname(diskPath).toLowerCase();
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/jpeg';
    return new StreamableFile(fsSync.createReadStream(diskPath), {
      type: mime,
      disposition: `inline; filename="${path.basename(diskPath)}"`,
    });
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
