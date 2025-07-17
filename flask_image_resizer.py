from flask import Flask, request, render_template, send_file, jsonify
import os
import io
import base64
from PIL import Image, ImageDraw, ImageFont
from werkzeug.utils import secure_filename
import tempfile
import uuid

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Allowed file extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def calculate_new_dimensions(original_width, original_height, target_width, target_height, maintain_aspect=True):
    """Calculate new dimensions while maintaining aspect ratio if requested"""
    if not maintain_aspect:
        return target_width, target_height
    
    # Calculate scaling factors
    scale_x = target_width / original_width
    scale_y = target_height / original_height
    
    # Use the smaller scale to ensure the image fits within target dimensions
    scale = min(scale_x, scale_y)
    
    new_width = int(original_width * scale)
    new_height = int(original_height * scale)
    
    return new_width, new_height

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_image():
    if 'file' not in request.files:
        return jsonify({'error': 'No file selected'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if file and allowed_file(file.filename):
        try:
            # Open and process the image
            img = Image.open(file.stream)
            
            # Convert to RGB if necessary (handles different formats)
            if img.mode in ('RGBA', 'LA', 'P'):
                img = img.convert('RGB')
            
            # Get original dimensions
            original_width, original_height = img.size
            
            # Convert image to base64 for preview
            img_io = io.BytesIO()
            img.save(img_io, format='JPEG', quality=85)
            img_io.seek(0)
            img_base64 = base64.b64encode(img_io.getvalue()).decode('utf-8')
            
            # Generate session ID for this image
            session_id = str(uuid.uuid4())
            
            # Store image in temporary location (in production, use proper storage)
            temp_dir = tempfile.gettempdir()
            temp_path = os.path.join(temp_dir, f"{session_id}_original.jpg")
            img.save(temp_path, format='JPEG', quality=95)
            
            return jsonify({
                'success': True,
                'session_id': session_id,
                'original_width': original_width,
                'original_height': original_height,
                'preview_image': f"data:image/jpeg;base64,{img_base64}"
            })
            
        except Exception as e:
            return jsonify({'error': f'Error processing image: {str(e)}'}), 500
    
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/resize', methods=['POST'])
def resize_image():
    data = request.get_json()
    session_id = data.get('session_id')
    target_width = int(data.get('width'))
    target_height = int(data.get('height'))
    maintain_aspect = data.get('maintain_aspect', True)
    output_format = data.get('format', 'JPEG').upper()
    
    # Overlay data
    overlay_data = data.get('overlay_data')
    
    if not session_id:
        return jsonify({'error': 'No session ID provided'}), 400
    
    try:
        # Load the original image
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, f"{session_id}_original.jpg")
        
        if not os.path.exists(temp_path):
            return jsonify({'error': 'Original image not found'}), 404
        
        img = Image.open(temp_path)
        original_width, original_height = img.size
        
        # Calculate new dimensions
        new_width, new_height = calculate_new_dimensions(
            original_width, original_height, 
            target_width, target_height, 
            maintain_aspect
        )
        
        # Resize the image
        resized_img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # Apply overlays if provided
        if overlay_data:
            print(f"Applying overlays with data: {overlay_data}")  # Debug print
            resized_img = apply_overlays(resized_img, overlay_data)
        
        # Save resized image for download
        resized_path = os.path.join(temp_dir, f"{session_id}_resized.jpg")
        
        # Convert to RGB if needed for JPEG
        if output_format == 'JPEG' and resized_img.mode == 'RGBA':
            rgb_image = Image.new('RGB', resized_img.size, (255, 255, 255))
            rgb_image.paste(resized_img, mask=resized_img.split()[-1])
            resized_img = rgb_image
        
        resized_img.save(resized_path, format=output_format, quality=95)
        
        # Create preview
        preview_io = io.BytesIO()
        resized_img.save(preview_io, format='JPEG', quality=85)
        preview_io.seek(0)
        preview_base64 = base64.b64encode(preview_io.getvalue()).decode('utf-8')
        
        return jsonify({
            'success': True,
            'new_width': new_width,
            'new_height': new_height,
            'preview_image': f"data:image/jpeg;base64,{preview_base64}"
        })
        
    except Exception as e:
        print(f"Error in resize_image: {e}")  # Debug print
        return jsonify({'error': f'Error resizing image: {str(e)}'}), 500

def apply_overlays(base_image, overlay_data):
    """Apply logo and text overlays to the base image"""
    try:
        # Create a copy to work with, ensuring it's in a mode that allows transparency
        img_with_overlays = base_image.copy().convert('RGBA')

        # Apply logo if provided
        if overlay_data.get('logo'):
            img_with_overlays = apply_logo_overlay(img_with_overlays, overlay_data)

        # Apply text if provided
        if overlay_data.get('text'):
            img_with_overlays = apply_text_overlay(img_with_overlays, overlay_data)

        return img_with_overlays

    except Exception as e:
        print(f"Error applying overlays: {e}")
        return base_image

def apply_logo_overlay(base_image, overlay_data):
    """Apply logo overlay to the image"""
    try:
        # Decode logo
        logo_data = overlay_data['logo']
        logo_bytes = base64.b64decode(logo_data.split(',')[1])
        logo_img = Image.open(io.BytesIO(logo_bytes))
        
        # Ensure logo has transparency
        if logo_img.mode != 'RGBA':
            logo_img = logo_img.convert('RGBA')
        
        img_width, img_height = base_image.size
        logo_size = overlay_data.get('logo_size', 0.15)
        logo_position = overlay_data.get('logo_position', 'top-right')
        
        # Calculate logo dimensions (proportional to image)
        logo_width = int(img_width * logo_size)
        logo_height = int((logo_img.height / logo_img.width) * logo_width)
        
        # Resize logo
        logo_resized = logo_img.resize((logo_width, logo_height), Image.Resampling.LANCZOS)
        
        # Calculate position
        padding = 20
        positions = {
            'top-left': (padding, padding),
            'top-right': (img_width - logo_width - padding, padding),
            'bottom-left': (padding, img_height - logo_height - padding),
            'bottom-right': (img_width - logo_width - padding, img_height - logo_height - padding),
            'center': ((img_width - logo_width) // 2, (img_height - logo_height) // 2)
        }
        
        x, y = positions.get(logo_position, positions['top-right'])
        
        # Paste logo onto image
        base_image.paste(logo_resized, (x, y), logo_resized)
        
        return base_image
        
    except Exception as e:
        print(f"Error applying logo: {e}")
        return base_image

def apply_text_overlay(base_image, overlay_data):
    """Apply text overlay to the image"""
    try:
        # Prepare to draw on the image
        draw = ImageDraw.Draw(base_image)
        img_width, img_height = base_image.size

        # Get all text properties from the overlay data
        text = overlay_data['text']
        text_size = overlay_data.get('text_size', 36)
        text_color = overlay_data.get('text_color', '#ffffff')
        text_shadow = overlay_data.get('text_shadow', True)
        font_family = overlay_data.get('font_family', 'Arial')
        text_draggable = overlay_data.get('text_draggable', False)

        # --- FONT LOADING LOGIC ---
        font_map = {
            'Arial': 'arial.ttf', 'Impact': 'impact.ttf', 'Helvetica': 'helvetica.ttf',
            'Times New Roman': 'times.ttf', 'Georgia': 'georgia.ttf', 'Verdana': 'verdana.ttf',
            'Comic Sans MS': 'comic.ttf', 'Courier New': 'cour.ttf'
        }
        font_filename = font_map.get(font_family, 'arial.ttf')
        font_path = os.path.join('fonts', font_filename)

        scale_factor = img_width / 1000
        scaled_text_size = max(12, int(text_size * scale_factor))

        try:
            font = ImageFont.truetype(font_path, scaled_text_size)
        except IOError:
            print(f"Warning: Font '{font_path}' not found. Falling back to default.")
            font = ImageFont.load_default()

        # --- TEXT POSITIONING LOGIC ---
        lines = text.split('\n')
        line_height = int(scaled_text_size * 1.2)

        if text_draggable:
            base_x = int(overlay_data.get('text_x', 0))
            base_y = int(overlay_data.get('text_y', 0))
        else:
            # ... (rest of the positioning logic is the same)
            text_position = overlay_data.get('text_position', 'bottom-center')
            padding = 30
            max_width = 0
            for line in lines:
                bbox = draw.textbbox((0, 0), line, font=font)
                line_width = bbox[2] - bbox[0]
                max_width = max(max_width, line_width)
            total_height = len(lines) * line_height

            if 'left' in text_position: base_x = padding
            elif 'right' in text_position: base_x = img_width - padding
            else: base_x = img_width // 2

            if text_position.startswith('top'): base_y = padding
            elif text_position.startswith('center'): base_y = (img_height - total_height) // 2
            else: base_y = img_height - total_height - padding

        # --- DRAWING LOGIC ---
        for i, line in enumerate(lines):
            if not line.strip(): continue
            y = base_y + (i * line_height)
            x = base_x

            if not text_draggable:
                line_width = draw.textbbox((0, 0), line, font=font)[2]
                if 'center' in text_position: x = base_x - (line_width / 2)
                elif 'right' in text_position: x = base_x - line_width

            if text_shadow:
                shadow_offset = max(2, int(scaled_text_size * 0.05))
                draw.text((x + shadow_offset, y + shadow_offset), line, font=font, fill='rgba(0, 0, 0, 150)')

            draw.text((x, y), line, font=font, fill=text_color)

        # Return the image that was drawn on
        return base_image

    except Exception as e:
        print(f"Error applying text: {e}")
        return base_image

@app.route('/download/<session_id>')
def download_image(session_id):
    try:
        temp_dir = tempfile.gettempdir()
        resized_path = os.path.join(temp_dir, f"{session_id}_resized.jpg")
        
        if not os.path.exists(resized_path):
            return jsonify({'error': 'Resized image not found'}), 404
        
        return send_file(
            resized_path,
            as_attachment=True,
            download_name=f"resized_image_{session_id}.jpg",
            mimetype='image/jpeg'
        )
        
    except Exception as e:
        return jsonify({'error': f'Error downloading image: {str(e)}'}), 500

@app.route('/preset/<preset_name>')
def apply_preset(preset_name):
    """Apply preset aspect ratios"""
    presets = {
        'instagram_post': {'width': 1080, 'height': 1080, 'ratio': '1:1'},
        'instagram_story': {'width': 1080, 'height': 1920, 'ratio': '9:16'},
        'youtube_thumbnail': {'width': 1280, 'height': 720, 'ratio': '16:9'},
        'facebook_post': {'width': 1200, 'height': 630, 'ratio': '1.91:1'},
        'linkedin_banner': {'width': 1584, 'height': 396, 'ratio': '4:1'},
        'twitter_post': {'width': 1200, 'height': 675, 'ratio': '16:9'}
    }
    
    if preset_name in presets:
        return jsonify(presets[preset_name])
    else:
        return jsonify({'error': 'Preset not found'}), 404

if __name__ == '__main__':
    app.run(debug=True)