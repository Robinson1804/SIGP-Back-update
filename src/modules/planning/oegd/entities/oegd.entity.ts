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

  @Column({ length: 500, nullable: true })
  indicador: string;

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
  @ManyToOne(() => Ogd, (ogd) => ogd.objetivosEspecificos)
  @JoinColumn({ name: 'ogd_id' })
  ogd: Ogd;

  @OneToMany('AccionEstrategica', 'oegd')
  accionesEstrategicas: any[];
}
