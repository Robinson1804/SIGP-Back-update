/**
 * SIGP - MinIO Service
 * Wrapper para operaciones con MinIO S3-compatible storage
 */

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { Readable } from 'stream';

export interface MinioConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
}

export interface BucketPolicy {
  Version: string;
  Statement: Array<{
    Effect: string;
    Principal: string | { AWS: string };
    Action: string | string[];
    Resource: string | string[];
  }>;
}

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Minio.Client;

  // Buckets del sistema
  readonly BUCKETS = {
    DOCUMENTOS: 'sigp-documentos',
    ADJUNTOS: 'sigp-adjuntos',
    AVATARES: 'sigp-avatares',
    BACKUPS: 'sigp-backups',
  } as const;

  // TTL por defecto para URLs presignadas
  readonly DEFAULT_PRESIGNED_TTL = 3600; // 1 hora

  constructor(private configService: ConfigService) {
    // Leer directamente de env vars para evitar problemas de caching con ConfigService
    const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
    const port = parseInt(process.env.MINIO_PORT || '9000', 10);
    const accessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin';
    const secretKey = process.env.MINIO_SECRET_KEY || 'minioadmin';

    // IMPORTANTE: La conexión INTERNA a MinIO siempre es HTTP (sin SSL)
    // Railway y Docker usan HTTP internamente, SSL es solo para el endpoint público
    const useSSL = false;

    this.logger.log(`[MinIO Config] Endpoint: ${endpoint}, Port: ${port}, SSL: ${useSSL} (interno siempre HTTP)`);

    this.client = new Minio.Client({
      endPoint: endpoint,
      port: port,
      useSSL: useSSL,
      accessKey: accessKey,
      secretKey: secretKey,
    });
  }

  /**
   * Inicializar buckets al arrancar el módulo
   */
  async onModuleInit(): Promise<void> {
    const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
    const port = process.env.MINIO_PORT || '9000';
    const publicEndpoint = process.env.MINIO_PUBLIC_ENDPOINT || endpoint;

    this.logger.log(`Inicializando MinIO Service...`);
    this.logger.log(`[MinIO] Endpoint interno: ${endpoint}:${port}`);
    this.logger.log(`[MinIO] Endpoint público: ${publicEndpoint}`);

    // Verificar conexión primero
    try {
      const buckets = await this.client.listBuckets();
      this.logger.log(`[MinIO] Conexión exitosa. Buckets existentes: ${buckets.map(b => b.name).join(', ') || 'ninguno'}`);
    } catch (error) {
      this.logger.error(`[MinIO] ERROR DE CONEXIÓN: ${error.message}`);
      this.logger.error(`[MinIO] Verificar que MinIO esté accesible en ${endpoint}:${port}`);
      return; // No continuar si no hay conexión
    }

    for (const [name, bucket] of Object.entries(this.BUCKETS)) {
      try {
        const exists = await this.client.bucketExists(bucket);
        if (!exists) {
          await this.client.makeBucket(bucket, 'us-east-1');
          this.logger.log(`[MinIO] Bucket creado: ${bucket}`);

          // Configurar política para avatares (público)
          if (bucket === this.BUCKETS.AVATARES) {
            await this.setBucketPublicRead(bucket);
          }
        } else {
          this.logger.debug(`[MinIO] Bucket existente: ${bucket}`);
        }
      } catch (error) {
        this.logger.error(`[MinIO] Error inicializando bucket ${bucket}: ${error.message}`);
      }
    }

    this.logger.log('[MinIO] Service inicializado correctamente');
  }

  /**
   * Verificar conexión a MinIO
   */
  async healthCheck(): Promise<{ status: string; buckets: string[] }> {
    try {
      const buckets = await this.client.listBuckets();
      return {
        status: 'healthy',
        buckets: buckets.map((b) => b.name),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        buckets: [],
      };
    }
  }

  /**
   * Reemplazar endpoint interno de Docker con endpoint público para URLs del browser
   */
  private replaceWithPublicEndpoint(url: string): string {
    // Leer directamente de variables de entorno para evitar problemas de config
    const internalEndpoint = process.env.MINIO_ENDPOINT || 'localhost';
    const publicEndpoint = process.env.MINIO_PUBLIC_ENDPOINT || internalEndpoint;
    const internalPort = process.env.MINIO_PORT || '9000';

    this.logger.debug(`[MinIO URL] Original: ${url}`);
    this.logger.debug(`[MinIO URL] Internal: ${internalEndpoint}, Public: ${publicEndpoint}`);

    // Si son iguales, no hace falta reemplazar
    if (internalEndpoint === publicEndpoint || !publicEndpoint) {
      return url;
    }

    // Construir la URL interna que necesitamos reemplazar
    const internalPatternHttp = `http://${internalEndpoint}:${internalPort}`;
    const internalPatternHttps = `https://${internalEndpoint}:${internalPort}`;

    // Railway y servicios cloud usan HTTPS sin puerto explícito para URLs públicas
    const isCloudEndpoint = publicEndpoint.includes('.railway.app') ||
                            publicEndpoint.includes('.vercel.app') ||
                            publicEndpoint.includes('.amazonaws.com') ||
                            publicEndpoint.includes('.cloudflare.com');

    const publicUrl = isCloudEndpoint
      ? `https://${publicEndpoint}`
      : `http://${publicEndpoint}:${internalPort}`;

    // Reemplazar el endpoint interno con el público
    let result = url.replace(internalPatternHttp, publicUrl);
    result = result.replace(internalPatternHttps, publicUrl);

    this.logger.debug(`[MinIO URL] Transformed: ${result}`);

    return result;
  }

  /**
   * Generar URL presignada para subida (PUT)
   */
  async getPresignedPutUrl(
    bucket: string,
    objectKey: string,
    ttlSeconds: number = this.DEFAULT_PRESIGNED_TTL,
  ): Promise<string> {
    try {
      this.logger.debug(`[MinIO] Generando presigned PUT URL para ${bucket}/${objectKey}`);
      const url = await this.client.presignedPutObject(bucket, objectKey, ttlSeconds);
      this.logger.debug(`[MinIO] URL generada: ${url.substring(0, 80)}...`);
      const publicUrl = this.replaceWithPublicEndpoint(url);
      this.logger.debug(`[MinIO] URL pública: ${publicUrl.substring(0, 80)}...`);
      return publicUrl;
    } catch (error) {
      this.logger.error(`[MinIO] Error generando presigned PUT URL: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Generar URL presignada para descarga (GET)
   */
  async getPresignedGetUrl(
    bucket: string,
    objectKey: string,
    ttlSeconds: number = this.DEFAULT_PRESIGNED_TTL,
  ): Promise<string> {
    try {
      this.logger.debug(`[MinIO] Generando presigned GET URL para ${bucket}/${objectKey}`);
      const url = await this.client.presignedGetObject(bucket, objectKey, ttlSeconds);
      const publicUrl = this.replaceWithPublicEndpoint(url);
      return publicUrl;
    } catch (error) {
      this.logger.error(`[MinIO] Error generando presigned GET URL: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Subir archivo directamente (para archivos pequeños o generados por el servidor)
   */
  async putObject(
    bucket: string,
    objectKey: string,
    data: Buffer | Readable,
    size?: number,
    metadata?: Record<string, string>,
  ): Promise<{ etag: string; versionId?: string | null }> {
    const metaData = {
      'Content-Type': metadata?.['Content-Type'] || 'application/octet-stream',
      ...metadata,
    };

    const result = await this.client.putObject(bucket, objectKey, data, size, metaData);
    return {
      etag: result.etag,
      versionId: result.versionId || null,
    };
  }

  /**
   * Obtener información de un objeto
   */
  async statObject(
    bucket: string,
    objectKey: string,
  ): Promise<Minio.BucketItemStat> {
    return this.client.statObject(bucket, objectKey);
  }

  /**
   * Verificar si un objeto existe
   */
  async objectExists(bucket: string, objectKey: string): Promise<boolean> {
    try {
      await this.client.statObject(bucket, objectKey);
      return true;
    } catch (error) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Descargar objeto
   */
  async getObject(bucket: string, objectKey: string): Promise<Readable> {
    return this.client.getObject(bucket, objectKey);
  }

  /**
   * Descargar objeto como Buffer
   */
  async getObjectAsBuffer(bucket: string, objectKey: string): Promise<Buffer> {
    const stream = await this.client.getObject(bucket, objectKey);
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  /**
   * Eliminar objeto
   */
  async removeObject(bucket: string, objectKey: string): Promise<void> {
    await this.client.removeObject(bucket, objectKey);
  }

  /**
   * Eliminar múltiples objetos
   */
  async removeObjects(bucket: string, objectKeys: string[]): Promise<void> {
    await this.client.removeObjects(bucket, objectKeys);
  }

  /**
   * Copiar objeto
   */
  async copyObject(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string,
  ): Promise<{ etag?: string; lastModified?: string | Date }> {
    const conditions = new Minio.CopyConditions();
    const result: any = await this.client.copyObject(
      destBucket,
      destKey,
      `/${sourceBucket}/${sourceKey}`,
      conditions,
    );
    return {
      etag: result.etag || '',
      lastModified: result.lastModified || new Date(),
    };
  }

  /**
   * Listar objetos en un bucket/prefix
   */
  async listObjects(
    bucket: string,
    prefix?: string,
    recursive: boolean = true,
  ): Promise<Minio.BucketItem[]> {
    const objects: Minio.BucketItem[] = [];
    const stream = this.client.listObjectsV2(bucket, prefix, recursive);

    return new Promise((resolve, reject) => {
      stream.on('data', (obj) => objects.push(obj));
      stream.on('end', () => resolve(objects));
      stream.on('error', reject);
    });
  }

  /**
   * Obtener tamaño total de un bucket/prefix
   */
  async getBucketSize(bucket: string, prefix?: string): Promise<number> {
    const objects = await this.listObjects(bucket, prefix);
    return objects.reduce((total, obj) => total + (obj.size || 0), 0);
  }

  /**
   * Configurar bucket como público (solo lectura)
   */
  private async setBucketPublicRead(bucket: string): Promise<void> {
    const policy: BucketPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucket}/*`],
        },
      ],
    };

    await this.client.setBucketPolicy(bucket, JSON.stringify(policy));
    this.logger.log(`Bucket ${bucket} configurado como público (lectura)`);
  }

  /**
   * Obtener URL pública (solo para buckets públicos)
   * Usa el endpoint público para acceso desde el browser
   */
  getPublicUrl(bucket: string, objectKey: string): string {
    const internalEndpoint = this.configService.get<string>('storage.minio.endpoint', 'localhost');
    const publicEndpoint = this.configService.get<string>('storage.minio.publicEndpoint', internalEndpoint);
    const port = this.configService.get<number>('storage.minio.port', 9000);
    const useSSL = this.configService.get<boolean>('storage.minio.useSSL', false);
    const protocol = useSSL ? 'https' : 'http';

    return `${protocol}://${publicEndpoint}:${port}/${bucket}/${objectKey}`;
  }

  /**
   * Generar URL presignada para POST (formulario multipart)
   */
  async getPresignedPostPolicy(
    bucket: string,
    objectKey: string,
    ttlSeconds: number = this.DEFAULT_PRESIGNED_TTL,
    conditions?: {
      maxSize?: number;
      contentType?: string;
    },
  ): Promise<Minio.PostPolicy> {
    const policy = this.client.newPostPolicy();

    policy.setBucket(bucket);
    policy.setKey(objectKey);

    const expiry = new Date();
    expiry.setSeconds(expiry.getSeconds() + ttlSeconds);
    policy.setExpires(expiry);

    if (conditions?.maxSize) {
      policy.setContentLengthRange(0, conditions.maxSize);
    }

    if (conditions?.contentType) {
      policy.setContentType(conditions.contentType);
    }

    return policy;
  }

  /**
   * Presign POST policy
   */
  async presignedPostPolicy(policy: Minio.PostPolicy): Promise<Minio.PostPolicyResult> {
    return this.client.presignedPostPolicy(policy);
  }

  /**
   * Obtener cliente MinIO raw (para casos avanzados)
   */
  getClient(): Minio.Client {
    return this.client;
  }
}
