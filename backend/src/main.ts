import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useStaticAssets(join(__dirname, '..', 'public'), {
    index: false,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI Market Research Platform API')
    .setDescription(
      'Developer documentation for the AI Market Research Platform backend.',
    )
    .setVersion('0.1.0')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/', (_req: unknown, res: { sendFile: (path: string) => void }) => {
    res.sendFile(join(__dirname, '..', 'public', 'index.html'));
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log('Dashboard:');
  console.log(`http://localhost:${port}/`);
  console.log('Swagger Documentation:');
  console.log(`http://localhost:${port}/docs`);
}
bootstrap();
