import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { AnalysisProfile } from './types/analysis-profile';

@Injectable()
export class ParseAnalysisProfilePipe implements PipeTransform<
  string,
  AnalysisProfile
> {
  transform(value: string): AnalysisProfile {
    if (
      value === AnalysisProfile.SHORT_TERM ||
      value === AnalysisProfile.LONG_TERM
    ) {
      return value;
    }

    throw new BadRequestException(
      `Invalid profile "${value}". Allowed values: ${AnalysisProfile.SHORT_TERM}, ${AnalysisProfile.LONG_TERM}.`,
    );
  }
}
