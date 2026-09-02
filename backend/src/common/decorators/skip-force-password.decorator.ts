import { SetMetadata } from '@nestjs/common';
import { SKIP_FORCE_PASSWORD_KEY } from '../guards/force-password.guard';

export const SkipForcePassword = () => SetMetadata(SKIP_FORCE_PASSWORD_KEY, true);
