import { Injectable, Inject } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

const SMOKE_TOKEN = Symbol('SMOKE_TOKEN');

interface Greeter {
  greet(name: string): string;
}

@Injectable()
class EnglishGreeter implements Greeter {
  greet(name: string): string {
    return `Hello, ${name}!`;
  }
}

@Injectable()
class WelcomeService {
  constructor(@Inject(SMOKE_TOKEN) private readonly greeter: Greeter) {}

  welcome(user: string): string {
    return this.greeter.greet(user);
  }
}

describe('DI & Decorator Smoke Test', () => {
  let welcomeService: WelcomeService;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        WelcomeService,
        {
          provide: SMOKE_TOKEN,
          useClass: EnglishGreeter,
        },
      ],
    }).compile();

    welcomeService = moduleRef.get<WelcomeService>(WelcomeService);
  });

  it('correctly resolves custom tokens and injected providers via NestJS DI', () => {
    expect(welcomeService).toBeDefined();
    expect(welcomeService.welcome('Antigravity')).toBe('Hello, Antigravity!');
  });
});
