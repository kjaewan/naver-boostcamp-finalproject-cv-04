<div align="center">

# Live2D Album Art

<img src="./assets/banner.jpg" alt="Live2D Album Art Banner" width="900" />

### 음악 검색 결과의 앨범아트를 Live2D 스타일 루프 영상(MP4)으로 자동 생성하는 서비스

<br/>

<img src="https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black" />
<img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" />
<img src="https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white" />
<img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white" />
<img src="https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white" />
<img src="https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white" />
<img src="https://img.shields.io/badge/ComfyUI-111111?style=flat&logo=github&logoColor=white" />
<img src="https://img.shields.io/badge/FFmpeg-007808?style=flat&logo=ffmpeg&logoColor=white" />

</div>

---

## 목차
- [프로젝트 소개](#프로젝트-소개)
- [결과물](#결과물)
- [주요 기능](#주요-기능)
- [핵심 문제와 해결](#핵심-문제와-해결)
- [시스템 아키텍처](#시스템-아키텍처)
- [생성 파이프라인](#생성-파이프라인)
- [API 개요](#api-개요)
- [팀원 소개](#팀원-소개)

---

## 프로젝트 소개
정적인 앨범아트를 더 몰입감 있게 소비할 수 있도록, 음악 검색부터 Live2D 스타일 루프 MP4 생성까지 한 번에 연결한 프로젝트입니다.

- 문제 정의: 앨범아트는 감성 전달력이 높지만 정적인 이미지라 체류 경험이 짧음
- 목표: 사용자가 검색한 트랙의 앨범아트를 자연스러운 루프 영상으로 변환해 즉시 재생 가능하게 제공
- 입력: 검색어(곡명/아티스트) 및 트랙 선택
- 출력: Loop MP4, Thumbnail, 메타데이터(`meta.json`)

---

## 결과물
예시 트랙: **MONKEY HOTEL - 잔나비**

| 원본 앨범아트 | 생성 결과 (Live2D Loop) |
|---|---|
| <img src="./assets/hotel_origin.jpg" alt="MONKEY HOTEL original album art" width="360" /> | <img src="./assets/hotel.gif" alt="MONKEY HOTEL live2d loop result" width="360" /> |

- 정적 앨범아트의 구도/텍스트를 유지한 채, 미세 모션이 반복되는 루프 영상으로 변환
- 결과물 형식: 최종 산출은 `MP4`이며, 문서에는 비교를 위해 `GIF`를 사용
- Demo URL: `<배포 링크>`

---

## 주요 기능
- iTunes 검색 기반 트랙 후보 조회(기본 상위 3개)
- YouTube Data API 기반 보조 메타 수집(임베드 URL/조회수) 및 점수화
- FastAPI 비동기 렌더 Job Queue 처리
- 이미지 바이트 + 워크플로우 버전 + 프리셋 기준 캐시 키 생성으로 중복 렌더 방지
- ComfyUI 워크플로우 호출 및 결과물 다운로드
- FFmpeg 후처리(`video.mp4` 정규화, 썸네일 `thumb.jpg` 생성)
- 렌더 상태 폴링(phase/progress/queue position) 및 히스토리 조회

---

## 핵심 문제와 해결
### 1) 앨범아트 정체성 유지
- 문제: 생성 과정에서 원본 구도/피사체가 무너지면 앨범 고유 아이덴티티가 약해짐
- 난점: 일반 영상 생성 프롬프트만으로는 커버아트의 인물 비율, 로고 위치, 배경 레이아웃이 쉽게 변형됨
- 해결:
  - 앨범아트를 직접 조건 이미지로 입력해 프레임 생성의 기준 축을 고정
  - 워크플로우의 `WanVideoLoraSelectMulti`에서 LoRA 3종을 동시 적용해 스타일을 좁힘  
    (`livewallpaper_wan22_5b_TI2V_000005000.safetensors`, `live2d_wan2.2.safetensors`, `step-6450.safetensors`)
  - 전용 학습 LoRA(`step-6450`)를 포함해 앨범아트 도메인에서 형태 보존과 Live2D 질감의 균형을 맞춤

### 2) 끊김 없는 루프(Seamless Loop)
- 문제: 영상 끝과 시작 프레임 경계에서 이질감 발생
- 난점: 마지막 프레임과 첫 프레임이 직접 맞닿으면 모션 방향/속도 차이로 점프 컷이 발생
- 해결:
  - ComfyUI에서 WhiteRabbit 계열 커스텀 노드인 `PrepareLoopFrames` -> `AssembleLoopFrames`를 사용해 루프용 프레임 시퀀스를 구성
  - 중간 구간은 `RIFE VFI`(multiplier 4)로 보간 프레임을 생성해 끝->시작 전환을 부드럽게 연결
  - 이후 `VHS_VideoCombine`으로 최종 영상화하여 경계 체감을 낮춤

### 3) 긴 생성 시간과 중복 요청
- 문제: 생성 시간이 길어 같은 앨범아트 요청이 반복되면 리소스 낭비
- 난점: 단일 작업이 수분 단위로 소요되어 동시 요청이 몰리면 대기열이 길어짐
- 해결:
  - 이미지 바이트 + `workflow_version` + `render_preset` 조합으로 캐시 키 생성
  - 동일 키 결과가 있으면 렌더링을 생략하고 즉시 `completed` 상태 반환(`cache_hit=true`)
  - 캐시 미스만 큐 워커에서 처리해 GPU 사용량을 안정화

---

## 시스템 아키텍처
아키텍처 이미지는 추후 삽입 예정입니다.

<!-- 예시: ![architecture](./assets/architecture.png) -->

```text
User -> React Frontend -> FastAPI Backend
     -> (iTunes API + YouTube API + Queue + Cache)
     -> ComfyUI -> MP4 / Thumbnail / Meta
```

---

## 생성 파이프라인
1. 사용자가 검색어 입력 후 트랙 선택
2. `POST /api/v1/renders`로 렌더 Job 생성
3. 백엔드가 앨범아트 다운로드 후 캐시 키 계산
4. 캐시 존재 시 즉시 결과 URL 반환
5. 캐시 미존재 시 입력 이미지를 ComfyUI input에 저장하고 큐에 적재
6. 워커가 ComfyUI `/prompt` 실행 후 진행률 수집
7. 완료 파일 다운로드 후 MP4 변환/썸네일 생성
8. `meta.json` 저장 및 상태 `completed`로 업데이트

상태(phase) 흐름:
`queued -> preparing -> prompting -> sampling -> assembling -> postprocessing -> done`

---

## API 개요
기본 Prefix: `/api/v1`

### 1) 음악 검색
- `GET /music/search?q={query}&limit={1..10}`
- 설명: iTunes 검색 결과를 YouTube 조회수 기반 점수와 함께 반환

응답 예시:
```json
{
  "items": [
    {
      "track_id": "1783002934",
      "album_id": "1783002932",
      "title": "NASTY",
      "artist": "ONE OK ROCK",
      "album_art_url": "https://...",
      "youtube_video_id": "xxxxxxx",
      "youtube_embed_url": "https://www.youtube.com/embed/xxxxxxx",
      "score": 0.923411
    }
  ]
}
```

### 2) 렌더 생성
- `POST /renders`
- 설명: 선택한 트랙으로 렌더 Job 생성(캐시 히트 시 즉시 완료 상태)

요청 예시:
```json
{
  "track_id": "1783002934",
  "album_id": "1783002932",
  "title": "NASTY",
  "artist": "ONE OK ROCK",
  "album_art_url": "https://...",
  "youtube_video_id": "xxxxxxx"
}
```

응답 예시:
```json
{
  "job_id": "uuid",
  "status": "queued",
  "cache_hit": false,
  "poll_url": "/api/v1/renders/uuid"
}
```

### 3) 렌더 상태 조회
- `GET /renders/{job_id}`
- 설명: 현재 상태, phase, progress, 결과 URL을 반환

### 4) 히스토리 조회/삭제
- `GET /renders/history?limit=6&include_failed=false`
- `DELETE /renders/history?include_failed=false`

---

## 팀원 소개

<table align="center"> <tr> <td align="center"> <img src="https://github.com/Subakmat.png" width="90"/><br/> <b>최호준</b><br/> <a href="https://github.com/Subakmat">@Subakmat</a> </td> <td align="center"> <img src="https://github.com/YangJH01.png" width="90"/><br/> <b>양지훈</b><br/> <a href="https://github.com/YangJH01">@YangJH01</a> </td> <td align="center"> <img src="https://github.com/kjaewan.png" width="90"/><br/> <b>고재완</b><br/> <a href="https://github.com/kjaewan">@kjaewan</a> </td> <td align="center"> <img src="https://github.com/Dae0Kkomi.png" width="90"/><br/> <b>고대영</b><br/> <a href="https://github.com/Dae0Kkomi">@Dae0Kkomi</a> </td> </tr> </table>
