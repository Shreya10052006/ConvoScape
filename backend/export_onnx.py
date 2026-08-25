import os
import sys
import site

# PyTorch Windows DLL configuration
torch_lib = r'C:\Users\Shreya\AppData\Roaming\Python\Python313\site-packages\torch\lib'
if os.path.exists(torch_lib):
    try:
        os.add_dll_directory(torch_lib)
    except Exception:
        pass

site.addsitedir(r'C:\Users\Shreya\AppData\Roaming\Python\Python313\site-packages')
site.addsitedir(site.getusersitepackages())

import torch
import onnx
import onnxruntime as ort

wav2lip_dir = os.path.abspath('backend/Wav2Lip')
if wav2lip_dir not in sys.path:
    sys.path.insert(0, wav2lip_dir)

try:
    from models import Wav2Lip
except Exception:
    from backend.Wav2Lip.models import Wav2Lip

def export():
    checkpoint_path = os.path.abspath('backend/models/wav2lip_gan.pth')
    onnx_output_path = os.path.abspath('backend/models/wav2lip_gan.onnx')
    
    print(f"[ONNX Exporter] Loading PyTorch model from {checkpoint_path}...")
    model = Wav2Lip()
    checkpoint = torch.load(checkpoint_path, map_location='cpu')
    s_dict = checkpoint.get('state_dict', {})
    new_s = {k.replace('module.', ''): v for k, v in s_dict.items()}
    model.load_state_dict(new_s, strict=False)
    model.eval()

    # Dummy inputs: mel [B, 1, 80, 16], img [B, 6, 96, 96]
    dummy_batch = 1
    dummy_mel = torch.randn(dummy_batch, 1, 80, 16, dtype=torch.float32)
    dummy_img = torch.randn(dummy_batch, 6, 96, 96, dtype=torch.float32)

    print(f"[ONNX Exporter] Exporting to {onnx_output_path} with dynamic batch axes...")
    torch.onnx.export(
        model,
        (dummy_mel, dummy_img),
        onnx_output_path,
        export_params=True,
        opset_version=17,
        do_constant_folding=True,
        input_names=['audio_mel', 'face_img'],
        output_names=['pred_face'],
        dynamic_axes={
            'audio_mel': {0: 'batch_size'},
            'face_img': {0: 'batch_size'},
            'pred_face': {0: 'batch_size'}
        },
        dynamo=False
    )

    print("[ONNX Exporter] Validating ONNX model graph...")
    onnx_model = onnx.load(onnx_output_path)
    onnx.checker.check_model(onnx_model)

    print("[ONNX Exporter] Testing inference session with ONNX Runtime...")
    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    opts.intra_op_num_threads = os.cpu_count() or 8
    
    session = ort.InferenceSession(onnx_output_path, opts, providers=['CPUExecutionProvider'])
    inputs = {
        'audio_mel': dummy_mel.numpy(),
        'face_img': dummy_img.numpy()
    }
    outputs = session.run(None, inputs)
    print(f"[ONNX Exporter] SUCCESS! Output shape: {outputs[0].shape}, File size: {os.path.getsize(onnx_output_path):,} bytes")

if __name__ == '__main__':
    export()
