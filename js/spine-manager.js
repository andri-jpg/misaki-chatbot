/**
 * ===================================================================
 * SPINE ANIMATION MANAGER
 * Handles all Spine WebGL operations and animations
 * ===================================================================
 */

class SpineManager {
  constructor() {
    // Core Spine objects
    this.canvas = null;
    this.gl = null;
    this.shader = null;
    this.batcher = null;
    this.mvp = new spine.webgl.Matrix4();
    this.assetManager = null;
    this.skeletonRenderer = null;

    // Animation state
    this.spineData = null;
    this.lastFrameTime = 0;
    this.animationLoop = null;
    this.isInitialized = false;

    // Settings
    this.customScale = CONFIG.CUSTOM_SCALE;
    this.targetFps = CONFIG.TARGET_FPS;

    // Animation queue for sequencing
    this.animationQueue = [];
    this.currentAnimation = null;

    // Event callbacks
    this.onInitialized = null;
    this.onAnimationComplete = null;
    this.onError = null;
  }

  /**
   * Initialize the Spine system
   */
  async init() {
    try {
      CONFIG.utils.log('debug', '🎬 Initializing Spine Manager...');

      this.setupCanvas();
      this.setupWebGL();
      this.setupSpineComponents();
      this.setupAssetManager();

      await this.loadAssets();

      this.isInitialized = true;
      CONFIG.utils.log('info', '✅ Spine Manager initialized successfully');

      if (this.onInitialized) {
        this.onInitialized();
      }

    } catch (error) {
      CONFIG.utils.log('error', '❌ Spine Manager initialization failed:', error);
      if (this.onError) {
        this.onError(error);
      }
      throw error;
    }
  }

  /**
   * Setup canvas element
   */
  setupCanvas() {
    this.canvas = document.getElementById('canvas');
    if (!this.canvas) {
      throw new Error('Canvas element not found');
    }

    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    CONFIG.utils.log('debug', '📱 Canvas setup complete');
  }

  /**
   * Setup WebGL context
   */
  setupWebGL() {
    const config = { alpha: false };
    this.gl = this.canvas.getContext('webgl', config) ||
      this.canvas.getContext('experimental-webgl', config);

    if (!this.gl) {
      throw new Error('WebGL is not supported');
    }

    CONFIG.utils.log('debug', '🎨 WebGL context created');
  }

  /**
   * Setup Spine WebGL components
   */
  setupSpineComponents() {
    this.shader = spine.webgl.Shader.newTwoColoredTextured(this.gl);
    this.batcher = new spine.webgl.PolygonBatcher(this.gl);
    this.mvp.ortho2d(0, 0, this.canvas.width - 1, this.canvas.height - 1);
    this.skeletonRenderer = new spine.webgl.SkeletonRenderer(this.gl);

    CONFIG.utils.log('debug', '🔧 Spine components initialized');
  }

  /**
   * Setup asset manager and load assets
   */
  setupAssetManager() {
    this.assetManager = new spine.webgl.AssetManager(this.gl);
    this.assetManager.loadBinary(CONFIG.BINARY_PATH);
    this.assetManager.loadTextureAtlas(CONFIG.ATLAS_PATH);

    CONFIG.utils.log('debug', '📦 Asset loading started');
  }

  /**
   * Wait for assets to load and create spine data
   */
  async loadAssets() {
    return new Promise((resolve, reject) => {
      const checkLoading = () => {
        if (this.assetManager.isLoadingComplete()) {
          try {
            this.spineData = this.loadSpineData(false);
            this.lastFrameTime = Date.now() / 1000;
            this.startRenderLoop();
            resolve();
          } catch (error) {
            reject(error);
          }
        } else {
          requestAnimationFrame(checkLoading);
        }
      };
      checkLoading();
    });
  }

  /**
   * Create spine data from loaded assets
   */
  loadSpineData(premultipliedAlpha) {
    const atlas = this.assetManager.get(CONFIG.ATLAS_PATH);
    const atlasLoader = new spine.AtlasAttachmentLoader(atlas);
    const skeletonBinary = new spine.SkeletonBinary(atlasLoader);

    skeletonBinary.scale = 1;
    const skeletonData = skeletonBinary.readSkeletonData(this.assetManager.get(CONFIG.BINARY_PATH));
    const skeleton = new spine.Skeleton(skeletonData);
    const bounds = this.calculateSetupPoseBounds(skeleton);
    const animationStateData = new spine.AnimationStateData(skeleton.data);
    const animationState = new spine.AnimationState(animationStateData);

    animationState.setAnimation(0, CONFIG.WELCOME_ANIMATION, false);

    animationState.addAnimation(0, CONFIG.LOOPING_ANIMATION, true, 0);

    CONFIG.utils.log('debug', '🎭 Spine data loaded successfully');

    return {
      skeleton: skeleton,
      state: animationState,
      bounds: bounds,
      premultipliedAlpha: premultipliedAlpha
    };
  }

  /**
   * Calculate skeleton bounds for positioning
   */
  calculateSetupPoseBounds(skeleton) {
    skeleton.setToSetupPose();
    skeleton.updateWorldTransform();
    const offset = new spine.Vector2();
    const size = new spine.Vector2();
    skeleton.getBounds(offset, size, []);
    return { offset: offset, size: size };
  }

  /**
   * Start the main render loop
   */
  startRenderLoop() {
    const render = () => {
      if (!this.isInitialized || !this.spineData) return;

      const now = Date.now() / 1000;
      const delta = now - this.lastFrameTime;
      this.lastFrameTime = now;

      this.resize();
      this.renderFrame(delta);

      // FPS throttling
      const elapsed = Date.now() / 1000 - now;
      const targetFrameTime = 1 / this.targetFps;
      const delay = Math.max(targetFrameTime - elapsed, 0) * 1000;

      this.animationLoop = setTimeout(() => {
        requestAnimationFrame(render);
      }, delay);
    };

    requestAnimationFrame(render);
    CONFIG.utils.log('debug', '🎬 Render loop started');
  }

  /**
   * Render a single frame
   */
  renderFrame(delta) {
    // Clear canvas
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    // Update animation
    const skeleton = this.spineData.skeleton;
    const state = this.spineData.state;

    state.update(delta);
    state.apply(skeleton);
    skeleton.updateWorldTransform();

    // Render skeleton
    this.shader.bind();
    this.shader.setUniformi(spine.webgl.Shader.SAMPLER, 0);
    this.shader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, this.mvp.values);

    this.batcher.begin(this.shader);
    this.skeletonRenderer.premultipliedAlpha = this.spineData.premultipliedAlpha;
    this.skeletonRenderer.draw(this.batcher, skeleton);
    this.batcher.end();

    this.shader.unbind();

    // Check for animation completion
    this.checkAnimationCompletion();
  }

  /**
   * Handle canvas resize
   */
  resize() {
    if (!this.spineData) return;

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    const bounds = this.spineData.bounds;
    const centerX = bounds.offset.x + bounds.size.x / 2;
    const centerY = bounds.offset.y + bounds.size.y / 2.5;
    const scaleX = bounds.size.x / this.canvas.width;
    const scaleY = bounds.size.y / this.canvas.height;
    let scale = Math.max(scaleX, scaleY) * 0.7;

    scale = Math.max(scale, 1);
    scale = scale / this.customScale;

    const width = this.canvas.width * scale;
    const height = this.canvas.height * scale;

    this.mvp.ortho2d(centerX - width / 2, centerY - height / 2, width, height);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Play a specific animation
   */
  playAnimation(motionAnim, mouthAnim = null, loop = false, trackIndex = 1) {
    if (!this.spineData || !this.spineData.state) {
      CONFIG.utils.log('warn', '⚠️ Cannot play animation: Spine data not ready');
      return false;
    }

    try {
      // Set motion animation
      this.spineData.state.setAnimation(trackIndex, motionAnim, loop);

      // Set mouth animation if provided
      if (mouthAnim) {
        this.spineData.state.setAnimation(trackIndex + 1, mouthAnim, loop);
      } else {
        this.spineData.state.clearTrack(trackIndex + 1);
      }

      this.currentAnimation = { motion: motionAnim, mouth: mouthAnim, loop: loop };

      CONFIG.utils.log('debug', `🎭 Playing animation: ${motionAnim}${mouthAnim ? ` + ${mouthAnim}` : ''}`);
      return true;

    } catch (error) {
      CONFIG.utils.log('error', '❌ Animation playback failed:', error);
      return false;
    }
  }

  /**
   * Play a random talking animation
   */
  playRandomTalkAnimation() {
    const animation = CONFIG.utils.getRandomTalkAnimation();
    return this.playAnimation(animation.motion, animation.mouth, false);
  }

  /**
   * Play idle animation
   */
  playIdleAnimation() {
    const idleAnim = CONFIG.utils.getRandomIdleAnimation();
    return this.playAnimation(idleAnim, null, true, 0);
  }

  /**
   * Stop current animation and return to idle
   */
  returnToIdle() {
    if (!this.spineData) return;

    // Clear all tracks except base idle
    for (let i = 1; i < 5; i++) {
      this.spineData.state.clearTrack(i);
    }

    // Ensure idle animation is playing
    this.playIdleAnimation();

    CONFIG.utils.log('debug', '😴 Returned to idle animation');
  }

  /**
   * Check if animation has completed
   */
  checkAnimationCompletion() {
    if (!this.spineData || !this.currentAnimation) return;

    const state = this.spineData.state;
    const track1 = state.getCurrent(1); // Motion track
    const track2 = state.getCurrent(2); // Mouth track

    // Check if both tracks are complete or empty
    const track1Complete = !track1 || track1.isComplete();
    const track2Complete = !track2 || track2.isComplete();

    if (track1Complete && track2Complete && !this.currentAnimation.loop) {
      if (this.onAnimationComplete) {
        this.onAnimationComplete(this.currentAnimation);
      }
      this.currentAnimation = null;
    }
  }

  /**
   * Set animation scale
   */
  setScale(scale) {
    this.customScale = scale;
    CONFIG.utils.log('debug', `📏 Scale changed to: ${scale}`);
  }

  /**
   * Set target FPS
   */
  setTargetFPS(fps) {
    this.targetFps = fps;
    CONFIG.utils.log('debug', `🎯 Target FPS changed to: ${fps}`);
  }

  /**
   * Get current animation info
   */
  getCurrentAnimation() {
    return this.currentAnimation;
  }

  /**
   * Check if Spine system is ready
   */
  isReady() {
    return this.isInitialized && this.spineData !== null;
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.animationLoop) {
      clearTimeout(this.animationLoop);
      this.animationLoop = null;
    }

    this.isInitialized = false;
    this.spineData = null;

    CONFIG.utils.log('info', '🧹 Spine Manager destroyed');
  }

  /**
   * Handle window resize
   */
  handleResize() {
    if (this.canvas) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.resize();
    }
  }
}

// Create global instance
window.spineManager = new SpineManager();