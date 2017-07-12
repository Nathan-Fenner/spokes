
import { Vec4, Vec3, Vec2, Mat4 } from './matrix'

let textureSize = 512;

type UniformOnlyType = {
    "image": {index: number, texture: WebGLTexture},
};

type SharedType = {
    "vec3": Vec3,
    "vec2": Vec2,
    "mat4": Mat4,
    "float": number,
};

type UniformType = {[k in keyof (UniformOnlyType & SharedType)]: (UniformOnlyType & SharedType)[k]}
type AttributeType = SharedType;

export type ProgramSpec = {
    uniforms: { [k: string]: keyof UniformType },
    attributes: { [k: string]: keyof AttributeType },
}

export type SurfaceTarget = "screen" | "texture";

type SurfaceTargetData = {
    screen: { type: "screen" },
    texture: { type: "texture", framebuffer: WebGLFramebuffer, renderBuffer: WebGLRenderbuffer, texture: WebGLTexture },
};

// TODO: include where it renders to in the type 
export class Glacier<Specification extends ProgramSpec, Target extends SurfaceTarget> {
    static float: "float" = "float";
    static vec2: "vec2" = "vec2";
    static vec3: "vec3" = "vec3";
    static vec4: "vec4" = "vec4";
    static mat2: "mat2" = "mat2";
    static mat3: "mat3" = "mat3";
    static mat4: "mat4" = "mat4";
    static image: "image" = "image";
    constructor(options: {
        fragmentShader: string,
        vertexShader: string,
        specification: Specification,
        context: WebGLRenderingContext,
        target: Target,
    }) {
        this.target = options.target;
        this.count = 0;
        this.gl = options.context;
        this.vertexShader = this.gl.createShader(this.gl.VERTEX_SHADER)!; // TODO: check error
        this.gl.shaderSource(this.vertexShader, options.vertexShader);
        this.gl.compileShader(this.vertexShader);
        if (!this.gl.getShaderParameter(this.vertexShader, this.gl.COMPILE_STATUS)) {
            throw {message: "error loading vertex shader: " + this.gl.getShaderInfoLog(this.vertexShader)};
        }
        this.fragmentShader = this.gl.createShader(this.gl.FRAGMENT_SHADER)!; // TODO: check error
        this.gl.shaderSource(this.fragmentShader, options.fragmentShader);
        this.gl.compileShader(this.fragmentShader);
        if (!this.gl.getShaderParameter(this.fragmentShader, this.gl.COMPILE_STATUS)) {
            throw {message: "error loading fragment shader: " + this.gl.getShaderInfoLog(this.fragmentShader)};
        }
        this.program = this.gl.createProgram()!; // TODO: check error
        this.gl.attachShader(this.program, this.vertexShader);
        this.gl.attachShader(this.program, this.fragmentShader);
        this.gl.linkProgram(this.program);
        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            throw {message: "error linking program: " + this.gl.getProgramInfoLog(this.program)};
        }
        this.attributeLocations = {} as any; // note: add all properties below
        this.attributeBuffers = {} as any; // note: add all properties below
        for (let attribute in options.specification.attributes) {
            this.attributeLocations[attribute] = this.gl.getAttribLocation(this.program, attribute); // TODO: check error
            this.attributeBuffers[attribute] = this.gl.createBuffer()!; // TODO: check error
        }
        this.uniformLocations = {} as any; // note: add all properties below
        for (let uniform in options.specification.uniforms) {
            this.uniformLocations[uniform] = this.gl.getUniformLocation(this.program, uniform)!; // TODO: check error
        }
        this.specification = options.specification;
        this.gl.enable(this.gl.DEPTH_TEST); // TODO: make this configurable

        if (this.target == "texture") {
            let gl = this.gl;

            // screen
            let framebuffer: WebGLFramebuffer = gl.createFramebuffer()!; // TODO: catch error

            // depth
            let renderBuffer: WebGLRenderbuffer = gl.createRenderbuffer()!; // TODO: catch error
            gl.bindRenderbuffer(gl.RENDERBUFFER, renderBuffer);
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, textureSize, textureSize);

            // texture
            let texture: WebGLTexture = gl.createTexture()!; // TODO: catch error
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, textureSize, textureSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, undefined);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

            // assign frame depth
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.bindRenderbuffer(gl.RENDERBUFFER, renderBuffer);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderBuffer);

            // assign frame texture
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            this.viewport = [0, 0, textureSize, textureSize]; // TODO: make this configurable

            this.frameData = {type: "texture", framebuffer, renderBuffer, texture};
        } else {
            this.frameData = {type: "screen"};
            this.viewport = [0, 0, 600, 600]; // TODO: make this configurable
        }
    }
    loadTexture(src: string, callback: () => void): WebGLTexture {
        let image = new Image();
        let texture: WebGLTexture = this.gl.createTexture()!; // TODO: error 
        image.src = src;
        image.onload = () => {
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
	        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
            callback();
        };
        return texture;
    }
    bufferTriangles(triangles: [
        {[attribute in keyof Specification["attributes"]]: AttributeType[Specification["attributes"][attribute]]},
        {[attribute in keyof Specification["attributes"]]: AttributeType[Specification["attributes"][attribute]]},
        {[attribute in keyof Specification["attributes"]]: AttributeType[Specification["attributes"][attribute]]}
    ][]) {
        for (let attribute in this.attributeBuffers) {
            let flattened: number[] = [];
            for (let triangle of triangles) {
                for (let vertex of triangle) {
                    let data = vertex[attribute];
                    if (typeof data == "number") {
                        flattened.push(data);
                    } else {
                        // TODO: is this the right type?
                        flattened.push(...(data as number[]));
                    }
                }
            }
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.attributeBuffers[attribute]);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(flattened), this.gl.STATIC_DRAW);
        }
        this.count = triangles.length;
    }
    activate() {
        this.gl.useProgram(this.program);
        let v = this.viewport;
        this.gl.viewport(v[0], v[1], v[2], v[3]);
        for (let attribute in this.attributeLocations) {
            this.gl.enableVertexAttribArray(this.attributeLocations[attribute]);
        }
        if (this.frameData.type == "screen") {
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        } else {
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, (this.frameData as {framebuffer: WebGLFramebuffer}).framebuffer);
        }
    }
    deactivate() {
        for (let attribute in this.attributeLocations) {
            this.gl.disableVertexAttribArray(this.attributeLocations[attribute]);
        }
    }
    private target: Target;
    private count: number;
    private specification: Specification;
    private gl: WebGLRenderingContext;
    private program: WebGLProgram;
    private vertexShader: WebGLShader;
    private fragmentShader: WebGLShader;
    private attributeLocations: {[k in keyof Specification["attributes"]]: number};
    private attributeBuffers: {[k in keyof Specification["attributes"]]: WebGLBuffer};
    private uniformLocations: {[k in keyof Specification["uniforms"]]: WebGLUniformLocation};
    private frameData: SurfaceTargetData[Target];
    private viewport: Vec4;
    setUniform(values: {[name in keyof Specification["uniforms"]]?: UniformType[Specification["uniforms"][name]]}) {
        for (let uniform in values) {
            switch (this.specification.uniforms[uniform]) {
                case "float": {
                    this.gl.uniform1f(this.uniformLocations[uniform], values[uniform] as any);
                    break;
                }
                case "vec4": {
                    let value = values[uniform] as Vec4; // TODO: typesafe
                    this.gl.uniform4f(this.uniformLocations[uniform], value[0], value[1], value[2], value[3]);
                    break;
                }
                case "vec3": {
                    let value = values[uniform] as Vec3; // TODO: typesafe
                    this.gl.uniform3f(this.uniformLocations[uniform], value[0], value[1], value[2]);
                    break;
                }
                case "vec2": {
                    let value = values[uniform] as Vec2; // TODO: typesafe
                    this.gl.uniform2f(this.uniformLocations[uniform], value[0], value[1]);
                    break;
                }
                case "mat4": {
                    let value = values[uniform] as Mat4; // TODO: typesafe
                    this.gl.uniformMatrix4fv(this.uniformLocations[uniform], false, value);
                    break;
                }
                case "image": {
                    let value = values[uniform] as {index: number, texture: WebGLTexture}; // TODO: typesafe
                    this.gl.activeTexture(this.gl.TEXTURE0 + value.index);
		            this.gl.bindTexture(this.gl.TEXTURE_2D, value.texture);
                    this.gl.uniform1i(this.uniformLocations[uniform], value.index);
                    break;
                }
                default: {
                    throw "unknown";
                }
            }
        }
    }
    draw(options: {clearColor: "no-clear" | [number, number, number]}) {
        if (options.clearColor && options.clearColor != "no-clear") {
            this.gl.clearColor(options.clearColor[0], options.clearColor[1], options.clearColor[2], 1);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        }
        // assign each buffer to its attribute
        let sizeof = {
            float: 1,
            vec2: 2,
            vec3: 3,
            vec4: 4,
            mat4: 16,
        };
        for (let attribute in this.attributeBuffers) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.attributeBuffers[attribute]);
            // TODO: support integer attributes, and fancier layouts
            let attributeType = this.specification.attributes[attribute];
            this.gl.vertexAttribPointer(this.attributeLocations[attribute], sizeof[attributeType], this.gl.FLOAT, false, 0, 0);
        }

        this.gl.drawArrays(this.gl.TRIANGLES, 0, this.count * 3);
    }
}

export function getGlacialTexture<S extends ProgramSpec>(g: Glacier<S, "texture">): WebGLTexture {
    // TODO: maybe make this typesafe
    return (g as any).frameData.texture;
}
