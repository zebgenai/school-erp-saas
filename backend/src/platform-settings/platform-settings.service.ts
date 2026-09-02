import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlatformSettingsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const settings = await this.prisma.platformSetting.findMany({
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
    // Hide secret values
    return settings.map((s) => ({
      ...s,
      value: s.isSecret ? '••••••••' : s.value,
    }));
  }

  async findAllRaw() {
    return this.prisma.platformSetting.findMany({
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
  }

  async upsertMany(updates: { key: string; value: string; label?: string; category?: string }[]) {
    const results = await Promise.all(
      updates.map((u) =>
        this.prisma.platformSetting.upsert({
          where: { key: u.key },
          create: {
            key: u.key,
            value: u.value,
            label: u.label ?? u.key,
            category: u.category ?? 'general',
          },
          update: { value: u.value },
        }),
      ),
    );
    return results;
  }

  async getValue(key: string): Promise<string | null> {
    const s = await this.prisma.platformSetting.findUnique({ where: { key } });
    return s?.value ?? null;
  }
}
