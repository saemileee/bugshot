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

## 성능 및 메모리 관리 원칙

### 1. 이벤트 리스너 관리 (필수)

**규칙: 모든 이벤트 리스너는 반드시 cleanup 해야 함**

```typescript
// ✅ Good - useEffect cleanup 있음
useEffect(() => {
  const handler = (e: Event) => { /* ... */ };
  element.addEventListener('click', handler);

  return () => {
    element.removeEventListener('click', handler);
  };
}, []);

// ❌ Bad - cleanup 없음 (메모리 누수)
useEffect(() => {
  element.addEventListener('click', handler);
}, []);
```

**체크리스트:**
- [ ] `addEventListener` 사용 시 `removeEventListener` 있는가?
- [ ] `chrome.storage.onChanged.addListener` 사용 시 `removeListener` 있는가?
- [ ] `MutationObserver` 사용 시 `disconnect()` 있는가?
- [ ] `ResizeObserver` 사용 시 `disconnect()` 있는가?
- [ ] Chrome API port 사용 시 `disconnect()` 있는가?

### 2. 고빈도 이벤트 핸들러 최적화 (필수)

**규칙: mousemove, scroll, resize 등은 반드시 쓰로틀링/디바운싱**

고빈도 이벤트: `mousemove`, `scroll`, `resize`, `touchmove`, `wheel`

#### 방법 1: requestAnimationFrame (권장)
```typescript
// ✅ Good - RAF 쓰로틀링
useEffect(() => {
  let rafId: number | null = null;

  const handleMove = (e: MouseEvent) => {
    if (rafId !== null) return;  // 이미 예약된 프레임이 있으면 스킵

    rafId = requestAnimationFrame(() => {
      rafId = null;
      // 실제 처리 (최대 60fps로 제한됨)
      updatePosition(e.clientX, e.clientY);
    });
  };

  document.addEventListener('mousemove', handleMove);

  return () => {
    document.removeEventListener('mousemove', handleMove);
    if (rafId !== null) cancelAnimationFrame(rafId);
  };
}, []);

// ❌ Bad - 쓰로틀링 없음 (초당 100+ 실행)
document.addEventListener('mousemove', (e) => {
  updatePosition(e.clientX, e.clientY);  // 매번 state 업데이트 = 💥
});
```

#### 방법 2: Debounce (입력 완료 후 실행)
```typescript
// ✅ Good - 300ms 디바운스
import { debounce } from 'lodash';

const debouncedSearch = useMemo(
  () => debounce((query: string) => {
    performSearch(query);
  }, 300),
  []
);

useEffect(() => {
  return () => debouncedSearch.cancel();
}, [debouncedSearch]);
```

**언제 사용?**
- RAF: 드래그, 애니메이션, 실시간 추적 (60fps 필요)
- Debounce: 검색, 자동완성, 저장 (완료 후 1회 실행)

### 3. 무거운 연산 최적화

#### 3.1 대량 데이터 반복 제한
```typescript
// ✅ Good - 제한과 early exit
function processRules(rules: CSSRuleList) {
  const MAX_RULES = 3000;
  const MAX_RESULTS = 500;
  let count = 0;

  for (let i = 0; i < rules.length && count < MAX_RULES; i++) {
    if (results.length >= MAX_RESULTS) break;  // Early exit
    count++;
    // process
  }
}

// ❌ Bad - 무제한 반복 (10,000+ 가능)
function processRules(rules: CSSRuleList) {
  for (let i = 0; i < rules.length; i++) {
    // UI 프리징 위험
  }
}
```

**권장 제한:**
- CSS 규칙: 3,000개
- DOM 노드: 1,000개
- 배열 필터링: 10,000개
- 재귀 깊이: 50 레벨

#### 3.2 비용이 큰 연산
```typescript
// ✅ Good - 조건 체크로 불필요한 연산 스킵
if (selector.length > 200) continue;  // 복잡한 selector 스킵
if (!element.matches(':hover')) continue;  // 상태 기반 스킵

// ❌ Bad - 모든 요소에 대해 무조건 실행
element.matches(complexSelector);  // 비용 큰 연산
```

**비용 큰 연산:**
- `element.matches()` - selector complexity에 비례
- `getComputedStyle()` - 레이아웃 재계산
- `getBoundingClientRect()` - 레이아웃 재계산
- `ctx.putImageData()` - 픽셀 수에 비례
- 정규식 (특히 백트래킹 가능한 패턴)

#### 3.3 동기 블로킹 방지
```typescript
// ✅ Good - 작업 분할 또는 Web Worker
async function processLargeData(data: any[]) {
  const CHUNK_SIZE = 100;

  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    processChunk(chunk);

    // UI 블로킹 방지 - 다음 이벤트 루프로 양보
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

// ❌ Bad - 동기 블로킹 (1초+ UI 멈춤 가능)
function processLargeData(data: any[]) {
  data.forEach(item => heavyOperation(item));  // 💥
}
```

### 4. React 최적화

#### 4.1 불필요한 리렌더 방지
```typescript
// ✅ Good - useMemo로 메모이제이션
const filteredList = useMemo(() => {
  return items.filter(item => item.name.includes(search));
}, [items, search]);

// ❌ Bad - 매 렌더마다 재계산
const filteredList = items.filter(item => item.name.includes(search));
```

#### 4.2 useCallback 의존성 관리
```typescript
// ✅ Good - 안정적인 의존성
const handler = useCallback(() => {
  doSomething(stableRef.current);
}, []);  // 빈 배열 OK (ref는 안정적)

// ⚠️ 주의 - 불안정한 의존성
const handler = useCallback(() => {
  doSomething(value);
}, [value]);  // value 변경마다 핸들러 재생성
```

#### 4.3 상태 업데이트 배치
```typescript
// ✅ Good - 하나의 상태로 묶기
const [position, setPosition] = useState({ x: 0, y: 0 });
setPosition({ x: newX, y: newY });  // 1회 리렌더

// ❌ Bad - 여러 상태 업데이트
const [x, setX] = useState(0);
const [y, setY] = useState(0);
setX(newX);  // 리렌더
setY(newY);  // 리렌더 (2회)
```

### 5. 메모리 관리

#### 5.1 대용량 데이터 처리
```typescript
// ✅ Good - 크기 제한 + 경고
if (blob.size > 10_000_000) {  // 10MB
  console.warn('[Module] Large file detected:', blob.size);
  // UI에 경고 표시 또는 처리 거부
}

// ❌ Bad - 무제한 처리
const dataUrl = await blobToBase64(blob);  // OOM 위험
```

**권장 제한:**
- 비디오: 10MB
- 이미지: 5MB
- Base64 변환: 필요한 경우만
- Canvas 크기: 4K (3840×2160) 이하

#### 5.2 타이머 정리
```typescript
// ✅ Good - 타이머 정리
useEffect(() => {
  const timerId = setTimeout(() => { /* ... */ }, 1000);
  return () => clearTimeout(timerId);
}, []);

// ❌ Bad - 타이머 정리 안 함
useEffect(() => {
  setTimeout(() => { /* ... */ }, 1000);
}, []);
```

#### 5.3 순환 참조 방지
```typescript
// ✅ Good - useRef 사용
const elementRef = useRef<HTMLElement | null>(null);

// ❌ Bad - 컴포넌트 state에 DOM 저장
const [element, setElement] = useState<HTMLElement | null>(null);
```

### 6. 성능 검증 체크리스트

새 기능 구현 후 반드시 확인:

**개발 중:**
- [ ] Chrome DevTools Performance 탭에서 프로파일링
- [ ] Long Task 경고 없음 (50ms 이상 블로킹)
- [ ] 메모리 누수 확인 (Performance Monitor)
- [ ] CPU 사용률 정상 (Idle: 5% 이하, 사용: 30% 이하)

**코드 리뷰 시:**
- [ ] 모든 이벤트 리스너에 cleanup 있음
- [ ] 고빈도 이벤트에 쓰로틀링 있음
- [ ] 무거운 반복문에 제한 있음
- [ ] 타이머 정리됨
- [ ] Large data에 크기 제한 있음

**경고 신호:**
```
⚠️ 이런 코드 발견 시 즉시 리팩토링:
- addEventListener without removeEventListener
- mousemove/scroll without RAF
- for loop > 5000 iterations
- Unthrottled state updates in handlers
- while(true) or setInterval without clear exit
- Canvas operations in loop without RAF
```

### 7. 성능 목표

**타겟 메트릭:**
- First Input Delay: < 100ms
- 고빈도 이벤트 핸들러: 60fps (16.67ms/frame)
- 무거운 연산: < 50ms (Long Task 기준)
- 메모리 증가: < 50MB/hour
- CPU (Idle): < 5%
- CPU (Active): < 30%

**측정 도구:**
- Chrome DevTools > Performance
- Chrome DevTools > Memory
- Chrome Task Manager (Shift+Esc)
