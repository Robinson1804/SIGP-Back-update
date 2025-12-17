import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CriterioEstado } from '../enums/historia-usuario.enum';
import { HistoriaUsuario } from './historia-usuario.entity';

@Entity({ schema: 'agile', name: 'criterios_aceptacion' })
export class CriterioAceptacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'historia_usuario_id' })
  historiaUsuarioId: number;

  @Column({ type: 'text' })
  given: string;

  @Column({ type: 'text' })
  when: string;

  @Column({ type: 'text' })
  then: string;

  @Column({
    type: 'enum',
    enum: CriterioEstado,
    default: CriterioEstado.PENDIENTE,
  })
  estado: CriterioEstado;

  @Column({ type: 'int', nullable: true })
  orden: number;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => HistoriaUsuario, (hu) => hu.criteriosAceptacion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'historia_usuario_id' })
  historiaUsuario: HistoriaUsuario;
}
