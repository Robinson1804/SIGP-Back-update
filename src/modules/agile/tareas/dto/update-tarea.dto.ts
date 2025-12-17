import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateTareaDto } from './create-tarea.dto';

export class UpdateTareaDto extends PartialType(
  OmitType(CreateTareaDto, ['tipo', 'historiaUsuarioId', 'actividadId', 'codigo'] as const),
) {}
