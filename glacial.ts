
import { Vec4, Vec3, Vec2, Mat4 } from './matrix'

type ParameterType = {
    "vec3": Vec3,
    "vec2": Vec2,
    "mat4": Mat4,
    "float": number,
}

type ParameterSpec = {
    [k: string]: keyof ParameterType;
}

type ProgramSpec = {
    uniforms: ParameterSpec,
    attributes: ParameterSpec,
}

// TODO: include where it renders to in the type 
export class Glacier<Specification extends ProgramSpec> {
    static float: "float" = "float";
    static vec2: "vec2" = "vec2";
    static vec3: "vec3" = "vec3";
    static vec4: "vec4" = "vec4";
    static mat2: "mat2" = "mat2";
    static mat3: "mat3" = "mat3";
    static mat4: "mat4" = "mat4";
    constructor(options: {
        fragmentShader: string,
        vertexShader: string,
        specification: Specification,
        context: WebGLRenderingContext,
    }) {
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
            throw {message: "error loading vertex shader: " + this.gl.getShaderInfoLog(this.fragmentShader)};
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
        this.gl.viewport(0, 0, 600, 600); // TODO: make this configurable
    }
    bufferTriangles(triangles: [
        {[attribute in keyof Specification["attributes"]]: ParameterType[Specification["attributes"][attribute]]},
        {[attribute in keyof Specification["attributes"]]: ParameterType[Specification["attributes"][attribute]]},
        {[attribute in keyof Specification["attributes"]]: ParameterType[Specification["attributes"][attribute]]}
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
        for (let attribute in this.attributeLocations) {
            this.gl.enableVertexAttribArray(this.attributeLocations[attribute]);
        }
    }
    deactivate() {
        for (let attribute in this.attributeLocations) {
            this.gl.disableVertexAttribArray(this.attributeLocations[attribute]);
        }
    }
    private count: number;
    private specification: Specification;
    private gl: WebGLRenderingContext;
    private program: WebGLProgram;
    private vertexShader: WebGLShader;
    private fragmentShader: WebGLShader;
    private attributeLocations: {[k in keyof Specification["attributes"]]: number};
    private attributeBuffers: {[k in keyof Specification["attributes"]]: WebGLBuffer};
    private uniformLocations: {[k in keyof Specification["uniforms"]]: WebGLUniformLocation};
    setUniform(values: {[name in keyof Specification["uniforms"]]?: ParameterType[Specification["uniforms"][name]]}) {
        for (let uniform in values) {
            // console.log(uniform, this.specification.uniforms[uniform], values[uniform]);
            switch (this.specification.uniforms[uniform]) {
                case "float": {
                    this.gl.uniform1f(this.uniformLocations[uniform], values[uniform] as any);
                    break;
                }
                case "vec4": {
                    let value = values[uniform] as Vec4;
                    this.gl.uniform4f(this.uniformLocations[uniform], value[0], value[1], value[2], value[3]);
                    break;
                }
                case "vec3": {
                    let value = values[uniform] as Vec3;
                    this.gl.uniform3f(this.uniformLocations[uniform], value[0], value[1], value[2]);
                    break;
                }
                case "vec2": {
                    let value = values[uniform] as Vec2;
                    this.gl.uniform2f(this.uniformLocations[uniform], value[0], value[1]);
                    break;
                }
                case "mat4": {
                    let value = values[uniform] as Mat4;
                    this.gl.uniformMatrix4fv(this.uniformLocations[uniform], false, value);
                    break;
                }
                default: {
                    throw "unknown";
                }
            }
        }
    }
    draw(options: {clearColor?: [number, number, number]} = {}) {
        if (options.clearColor) {
            this.gl.clearColor(options.clearColor[0], options.clearColor[1], options.clearColor[2], 1);
        }
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
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
