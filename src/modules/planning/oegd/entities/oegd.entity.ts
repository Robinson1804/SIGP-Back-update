import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Ogd } from '../../ogd/entities/ogd.entity';
import { MetaAnual } from '../../oei/entities/oei.entity';

@Entity('oegd', { schema: 'planning' })
export class Oegd {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: 'ogd_id' })
  ogdId: number;

  @Index()
  @Column({ length: 20, unique: true })
  codigo: string;

  @Column({ length: 300 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  @Column({ name: 'indicador_codigo', length: 50, nullable: true })
  indicadorCodigo: string;

  @Column({ name: 'indicador_nombre', length: 500, nullable: true })
  indicadorNombre: string;

  @Column({ name: 'unidad_medida', length: 50, nullable: true })
  unidadMedida: string;

  @Column({ name: 'linea_base_anio', type: 'int', nullable: true })
  lineaBaseAnio: number;

  @Column({ name: 'linea_base_valor', type: 'decimal', precision: 15, scale: 2, nullable: true })
  lineaBaseValor: number;

  @Column({ name: 'metas_anuales', type: 'jsonb', nullable: true })
  metasAnuales: MetaAnual[];

  @Index()
  @Column({ default: true })
  activo: boolean;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null | undefined;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null | undefined;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Ogd, (ogd) => ogd.objetivosEspecificos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ogd_id' })
  ogd: Ogd;

  @OneToMany('AccionEstrategica', 'oegd')
  accionesEstrategicas: any[];

  // Relación Many-to-Many con AEI (via tabla oegd_aei)
  @OneToMany('OegdAei', 'oegd')
  oegdAeis: any[];
}
