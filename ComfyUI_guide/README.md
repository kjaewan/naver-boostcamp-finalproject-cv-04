# ComfyUI Setup Guide (Detailed)

이 문서는 `pro-cv-finalproject-cv-04`가 요구하는 ComfyUI 실행 환경을 정리한 상세 가이드입니다.

중요:
- 이 폴더(`ComfyUI_guide`)는 문서 폴더입니다.
- 실제 ComfyUI 실행 디렉토리는 기본값으로 프로젝트의 형제 폴더 `../ComfyUI`를 사용합니다.

## 1. 권장 폴더 구조

```text
<workspace>/
  ComfyUI/                     # 실제 ComfyUI 실행 폴더
  pro-cv-finalproject-cv-04/
    ComfyUI_guide/README.md    # 현재 문서
    workflows/
      (API)Final_workflow.json
```

기본 환경 변수(`.env.example`):
- `COMFY_DIR=../ComfyUI`
- `COMFY_INPUT_DIR=../ComfyUI/input`
- `COMFY_BASE_URL=http://127.0.0.1:8188`

ComfyUI가 다른 위치에 있다면 `.env`에서 위 3개 값을 함께 수정하세요.

## 2. 워크플로우 기준 필수 커스텀 노드

기준 파일:
- `workflows/(API)Final_workflow.json`

필수 패키지:
- [`ComfyUI-WanVideoWrapper`](https://github.com/kijai/ComfyUI-WanVideoWrapper)
- [`ComfyUI-QwenVL`](https://github.com/1038lab/ComfyUI-QwenVL)
- [`whiterabbit`](https://github.com/Artificial-Sweetener/comfyui-WhiteRabbit)
- [`comfyui-frame-interpolation`](https://github.com/Fannovel16/ComfyUI-Frame-Interpolation)
- [`comfyui-videohelpersuite`](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite)
- [`rgthree-comfy`](https://github.com/rgthree/rgthree-comfy)
- [`comfyui_essentials`](https://github.com/cubiq/ComfyUI_essentials)
- [`comfyui-custom-scripts`](https://github.com/pythongosssss/ComfyUI-Custom-Scripts)
- [`comfyui-mxtoolkit`](https://github.com/Smirnov75/ComfyUI-mxToolkit)
- [`comfyui-easy-use`](https://github.com/yolain/ComfyUI-Easy-Use)
- [`ComfyUI_Swwan`](https://github.com/aining2022/ComfyUI_Swwan)

참고:
- `PrimitiveStringMultiline`, `StringConcatenate`, `Int`, `PreviewAny` 등은 ComfyUI 코어(또는 core extras)에서 제공되는 노드입니다.
- 위 노드가 없으면 ComfyUI 버전이 너무 오래되었거나 노드 로딩이 실패한 상태일 가능성이 큽니다.

## 3. 필수 모델 파일과 배치 경로

### 3-1. Base Model / VAE / Text Encoder
아래 3개는 직접 다운로드해서 지정 경로에 넣어주세요.

1. `wan2.2_ti2v_5B_fp16.safetensors`  
다운로드: https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors  
배치 경로: `ComfyUI/models/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors`

2. `wan2.2_vae.safetensors`  
다운로드: https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors  
배치 경로: `ComfyUI/models/vae/wan2.2_vae.safetensors`

3. `umt5_xxl_fp16.safetensors`  
다운로드: https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp16.safetensors  
배치 경로: `ComfyUI/models/text_encoders/umt5_xxl_fp16.safetensors`

### 3-2. LoRA
아래 LoRA 파일은 워크플로우에서 직접 참조됩니다.

1. `ComfyUI/models/loras/livewallpaper_wan22_5b_TI2V_000005000.safetensors`
2. `ComfyUI/models/loras/live2d_wan2.2.safetensors`
3. `ComfyUI/models/loras/step-6450.safetensors`

다운로드(위 3개 포함):
- https://drive.google.com/drive/folders/1CsC6mizo0m0J4Cpc2pGjlzll7YAvsXyn?usp=sharing

### 3-3. RIFE 보간 모델
`rife47.pth`는 `comfyui-frame-interpolation`(및 관련 노드) 설치 후 첫 실행 시 자동 다운로드되는 경우가 많습니다.

- 기본 위치: `ComfyUI/custom_nodes/comfyui-frame-interpolation/ckpts/rife/rife47.pth`
- 자동 다운로드가 실패하면 수동으로 해당 경로에 배치하세요.
- 수동 다운로드 링크: https://huggingface.co/jasonot/mycomfyui/blob/main/rife47.pth

## 4. 권장 설치 순서

1. ComfyUI를 프로젝트 형제 폴더로 준비
2. ComfyUI에서 커스텀 노드 설치(ComfyUI Manager 사용 권장)
3. 3-1 Base Model과 3-2 LoRA 파일을 지정 경로에 배치
4. ComfyUI 단독 실행 후 API 확인
5. 프로젝트 `.env` 준비 후 통합 실행

ComfyUI API 확인:

```bash
curl -fsS http://127.0.0.1:8188/system_stats
```

프로젝트 실행:

```bash
cd /path/to/pro-cv-finalproject-cv-04
cp .env.example .env
bash scripts/run_all.sh
```

## 5. 점검 체크리스트

1. `curl $COMFY_BASE_URL/system_stats` 가 정상 응답인지 확인
2. ComfyUI UI에서 워크플로우 로드 시 Missing Node 오류가 없는지 확인
3. `ComfyUI/input` 경로가 존재하고 쓰기 가능한지 확인
4. 백엔드에서 `COMFY_WORKFLOW_PATH`가 실제 파일(`workflows/(API)Final_workflow.json`)을 가리키는지 확인

## 6. 자주 발생하는 문제

1. `ComfyUI is not reachable`
원인: `COMFY_BASE_URL` 불일치 또는 ComfyUI 미기동  
조치: `COMFY_BASE_URL` 확인, ComfyUI 선기동 또는 `COMFY_AUTOSTART=1` 유지

2. `Missing node type ...`
원인: 커스텀 노드 미설치/로딩 실패  
조치: 해당 패키지 설치 후 ComfyUI 재시작

3. `no output file in ComfyUI history`
원인: 워크플로우 실패 또는 출력 노드 설정 문제  
조치: ComfyUI에서 동일 워크플로우를 직접 실행해 실패 지점 확인

4. 모델 로딩 실패(`file not found`)
원인: 파일명 불일치 또는 잘못된 폴더 위치  
조치: 3번 섹션의 파일명/경로를 정확히 맞춤
