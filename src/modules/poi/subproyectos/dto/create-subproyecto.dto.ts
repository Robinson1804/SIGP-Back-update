import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsDateString,
  IsEnum,
  IsArray,
  MaxLength,
  Matches,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProyectoEstado, Clasificacion } from '../../proyectos/enums/proyecto-estado.enum';
import { CostoAnualDto } from '../../proyectos/dto/create-proyecto.dto';

export class CreateSubproyectoDto {
  // ==========================================
  // OBLIGATORIOS
  // ==========================================

  @IsInt()
  proyectoPadreId: number;

  // Código es autogenerado en el backend
  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigo?: string;

  @IsString()
  @MaxLength(200)
  nombre: string;

  // ==========================================
  // BÁSICOS (OPCIONALES)
  // ==========================================

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsEnum(Clasificacion)
  clasificacion?: Clasificacion;

  // ==========================================
  // STAKEHOLDERS (OPCIONALES)
  // ==========================================

  @IsOptional()
  @IsInt()
  coordinadorId?: number;

  @IsOptional()
  @IsInt()
  scrumMasterId?: number;

  @IsOptional()
  @IsInt()
  areaUsuariaId?: number;

  // ==========================================
  // ADMINISTRATIVO (OPCIONALES)
  // ==========================================

  @IsOptional()
  @IsString()
  @MaxLength(100)
  coordinacion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  areaResponsable?: string;

  // ==========================================
  // FINANCIERO (OPCIONALES)
  // ==========================================

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areasFinancieras?: string[];

  @IsOptional()
  @IsNumber()
  monto?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(1)
  anios?: number[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CostoAnualDto)
  costosAnuales?: CostoAnualDto[];

  // ==========================================
  // ALCANCE Y VALOR DE NEGOCIO (OPCIONALES)
  // ==========================================

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  alcances?: string[];

  @IsOptional()
  @IsString()
  problematica?: string;

  @IsOptional()
  @IsString()
  beneficiarios?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  beneficios?: string[];

  // ==========================================
  // FECHAS (OPCIONALES)
  // ==========================================

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fechaInicio debe tener formato YYYY-MM-DD',
  })
  fechaInicio?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fechaFin debe tener formato YYYY-MM-DD',
  })
  fechaFin?: string;
}
