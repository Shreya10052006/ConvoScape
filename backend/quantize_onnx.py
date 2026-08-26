import os
from onnxruntime.quantization import quantize_dynamic, QuantType

def quantize():
    input_model = os.path.abspath('backend/models/wav2lip_gan.onnx')
    output_model = os.path.abspath('backend/models/wav2lip_gan_int8.onnx')
    
    if not os.path.exists(input_model):
        print(f"[Quantize] Error: {input_model} does not exist.")
        return

    print(f"[Quantize] Quantizing {input_model} to INT8 dynamic...")
    quantize_dynamic(
        model_input=input_model,
        model_output=output_model,
        weight_type=QuantType.QUInt8,
        per_channel=True,
        reduce_range=False
    )
    print(f"[Quantize] Successfully created INT8 model: {output_model} ({os.path.getsize(output_model):,} bytes)")

if __name__ == '__main__':
    quantize()
