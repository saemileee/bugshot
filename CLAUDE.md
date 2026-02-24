# BugShot Development Guidelines

## 개발 원칙

### 1. Silent Failure 금지
- 모든 fallback은 `console.warn` 이상으로 로깅할 것
- 에러가 조용히 무시되면 안 됨
- catch 블록에서 에러를 삼키지 말고 최소한 로깅할 것

```typescript
// Bad
try {
  await riskyOperation();
} catch {
  // fallback silently
  fallbackOperation();
}

// Good
try {
  await riskyOperation();
} catch (error) {
  console.warn('[Module] Primary method failed, using fallback:', error);
  fallbackOperation();
}
```

### 2. 외부 의존성 검증
- CDP, API 등 외부 의존성은 연결 상태를 반드시 로깅
- "동작한다고 가정"하지 말고 실제 동작 확인
- 새 기능 추가 시 해당 코드 경로가 실행되는지 로그로 확인

```typescript
// 기능 구현 후 반드시 확인
console.log('[Feature] Code path reached:', { param1, param2 });
```

### 3. Fallback 가시성
- UI에서 fallback 상태를 사용자가 인지할 수 있게 표시
- 개발 중에는 fallback 발생 시 눈에 띄는 경고 표시

### 4. 테스트 원칙
- Happy path만 테스트하지 말고 에러 케이스도 확인
- 외부 의존성이 실패할 때의 동작도 검증

## 프로젝트 구조

- `/src/content/` - Content script (Shadow DOM widget)
- `/src/background/` - Service worker
- `/src/offscreen/` - Offscreen document (recording/conversion)
- `/src/shared/` - Shared types and utilities

## Shadow DOM 주의사항

이 확장 프로그램은 **closed Shadow DOM** (`mode: 'closed'`)을 사용합니다.

- `document.addEventListener()`는 Shadow DOM 내부에서 제대로 동작하지 않음
- Event target이 shadow boundary를 넘을 때 retarget됨
- 외부 클릭 감지는 backdrop div 패턴 사용

## CDP (Chrome DevTools Protocol) 사용

- `DOM.enable`을 `CSS.enable`보다 먼저 호출해야 함
- Tailwind 클래스의 특수문자 (`[`, `]`, `!`)는 이스케이프 필요
- Selector combinator (`>`, `+`, `~`)는 이스케이프하면 안 됨
