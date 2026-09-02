import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

/** Path (after the global `api` prefix) that serves uploaded files. */
const FILE_DOWNLOAD_PATH = '/api/uploads/files/';

/**
 * Browsers cannot attach an Authorization header to `<img src>` or a plain download link,
 * so the client appends `?access_token=` for those URLs. Accepting the token from the query
 * string is limited to the file-download route to keep credentials out of the query string
 * (and therefore out of access logs and Referer headers) everywhere else.
 */
const fromFileDownloadQuery = (req: Request): string | null => {
  const path: string | undefined = (req as any)?.path ?? (req as any)?.url;
  if (!path || !path.startsWith(FILE_DOWNLOAD_PATH)) return null;
  const token = (req as any)?.query?.access_token;
  return typeof token === 'string' && token.length > 0 ? token : null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        fromFileDownloadQuery as any,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        schoolId: true,
        status: true,
        lockedUntil: true,
        forcePasswordChange: true,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account is inactive or not found');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account is locked');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      schoolId: user.schoolId,
      forcePasswordChange: user.forcePasswordChange,
      impersonatedBy: payload.impersonatedBy,
    };
  }
}
