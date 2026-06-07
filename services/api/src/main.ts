import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix("api");
  app.enableCors();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
