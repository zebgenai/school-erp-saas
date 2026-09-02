import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private prisma: PrismaService) {}

  liveness() {
    return {
      status: 'ok',
      service: 'clever-campus-backend',
      timestamp: new Date().toISOString(),
    };
  }

  async readiness() {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        service: 'clever-campus-backend',
        database: 'connected',
        latencyMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        status: 'error',
        service: 'clever-campus-backend',
        database: 'disconnected',
        error: 'Database unreachable',
        latencyMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
