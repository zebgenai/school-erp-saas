import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { classifyHostname } from './tenant-host';
import type { TenantSchool } from './tenant.types';

@Injectable()
export class TenantResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveFromHost(hostHeader?: string | string[]): Promise<TenantSchool | null> {
    const classified = classifyHostname(hostHeader);

    if (classified.kind === 'none' || classified.kind === 'platform') {
      return null;
    }

    const school = await this.prisma.school.findUnique({
      where: { slug: classified.slug },
      select: { id: true, name: true, slug: true, domain: true, status: true },
    });

    if (!school) {
      throw new NotFoundException(`No school found for subdomain "${classified.slug}"`);
    }

    return school;
  }
}
