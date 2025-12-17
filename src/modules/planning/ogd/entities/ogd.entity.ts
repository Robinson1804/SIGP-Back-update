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
import { Pgd } from '../../pgd/entities/pgd.entity';
import { MetaAnual } from '../../oei/entities/oei.entity';

@Entity('ogd', { schema: 'planning' })
export class Ogd {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: 'pgd_id' })
  pgdId: number;

  @Index()
  @Column({ length: 20, unique: true })
  codigo: string;

  @Column({ length: 300 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  @Column({ length: 500, nullable: true })
  indicador: string;

  @Column({ name: 'linea_base', type: 'decimal', precision: 15, scale: 2, nullable: true })
  lineaBase: number;

  @Column({ name: 'unidad_medida', length: 50, nullable: true })
  unidadMedida: string;

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
  @ManyToOne(() => Pgd, (pgd) => pgd.objetivosGobiernoDigital)
  @JoinColumn({ name: 'pgd_id' })
  pgd: Pgd;

  @OneToMany('Oegd', 'ogd')
  objetivosEspecificos: any[];
}
