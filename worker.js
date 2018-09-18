var babelString = `var sampleRate,outputBufferLength,compressPath;

var DEFAULT_MAX_VOLUME_LEVEL = 6;

var recBuffers  = [];
var pcmCache = [];
var pcmLength = 0;

this.onmessage = function(e){
    switch(e.data.command){
        case 'init':
            init(e.data.config);
            break;
        case 'record':
            record(e.data.buffer);
            break;
        case 'reset':
            reset();
            break;
        case 'exportAudio':
            exportAudio(e.data.type);
            break;
    }
};

function init(config){
    sampleRate = 44100;
    outputBufferLength = 1024;
    compressPath = config.compressPath;
}
function reset(){
    recBuffers = [];
    pcmCache = [];
    pcmLength = 0;
}

function record(inputBuffer){
    var rss = new Resampler(sampleRate, 16000, 1, outputBufferLength, true);

    var tempArray = [];
    for (var i = 0 ; i < inputBuffer.length ; i++) {
        tempArray.push(inputBuffer[i]);
    }

    var l = rss.resampler(tempArray);
    var outputBuffer = new Float32Array(l);
    for(var i = 0; i < l; i++)
        outputBuffer[i] = rss.outputBuffer[i];

    var data = floatTo16BitPCM(outputBuffer);

    //pcmCache.push(data);
    //pcmLength += data.length;

    pcmCache.push(outputBuffer);
    pcmLength += outputBuffer.length;

    for (var i = 0 ; i < data.length ; i++) {
        recBuffers.push(data[i]);
    }

    while(recBuffers.length > 320)
    {
        var items = recBuffers.splice(0, 320);
        var result = new Int16Array(320);
        for(var i = 0; i < 320; i++)
        {
            result[i] = items[i];
        }

        var volume = compute(result.buffer);
        this.postMessage({'volume' : volume, 'buffer' : result, 'command': 'stream'});
    }
}

function exportAudio(type) {
    var dataview = null;


    //var pa = new Int16Array(pcmLength);
    var pa = new Float32Array(pcmLength);
    var offset = 0;
    for(var i = 0; i < pcmCache.length; ++i) {
        pa.set(pcmCache[i], offset);
        offset += pcmCache[i].length;
    }

    if(type == "wav") {
        dataview = encodeWAV(pa);
    }

    var audioBlob = new Blob([dataview], {type: "audio/wav"});
    this.postMessage({command: 'blob', blob: audioBlob});
}

function compute(pcmData)
{
    if(pcmData == null || pcmData.byteLength <= 0)
    {
        return 0;
    }

    var audioLevel = 0;
    var sampleCount = pcmData.byteLength / 2;
    var fEnergy = getCalEnergy(pcmData);
    fEnergy = 10.0 *  Math.log(fEnergy / sampleCount);
    if(fEnergy < 100)
    {
        audioLevel = 0;
    }
    else if(fEnergy > 200)
    {
        audioLevel = DEFAULT_MAX_VOLUME_LEVEL;
    }
    else
    {
        audioLevel = parseInt((fEnergy - 100) * (DEFAULT_MAX_VOLUME_LEVEL) / 100);
    }
    return audioLevel;
}

function getCalEnergy(pcmData)
{
    var fDirectOffset = 0;
    var sampleCount = pcmData.byteLength / 128;
    var data = new Int16Array(pcmData);

    for(var i = 0; i < data.length; i ++)
    {
        fDirectOffset += data[i];
    }

    fDirectOffset /= sampleCount;
    var fEnergy = 0;
    for(var i = 0; i < data.length; i ++)
    {
        fEnergy += (data[i] - fDirectOffset) * (data[i] - fDirectOffset);
    }
    fEnergy += 400000;
    return fEnergy;
}

function floatTo16BitPCM(input)
{
    var output = new Int16Array(input.length);
    for (var i = 0; i < input.length; i++){
        var s = Math.max(-1, Math.min(1, input[i]));
        if(s < 0)
            output[i] = s * 0x8000;
        else
            output[i] = s * 0x7FFF;
    }
    return output;
}

function writeString(view, offset, string){
    for (var i = 0; i < string.length; i++){
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
function floatTo16BitPCM2(output, offset, input){
    for (var i = 0; i < input.length; i++, offset+=2){
        var s = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
}

function encodeWAV(samples){
    var buffer = new ArrayBuffer(44 + samples.length*2);
    var view = new DataView(buffer);

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* RIFF chunk length */
    view.setUint32(4, 36 + samples.length*2, true);
    /* RIFF type */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, 1, true);
    /* channel count */
    view.setUint16(22, 1, true);
    /* sample rate */
    view.setUint32(24, 16000, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, 16000 * 4, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, 2, true);
    /* bits per sample */
    view.setUint16(34, 16, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, samples.length*2, true);

    //view.setInt16(44, samples, true);
    floatTo16BitPCM2(view, 44, samples);

    return view;
}

function Resampler(fromSampleRate, toSampleRate, channels, outputBufferSize, noReturn) {

    this.fromSampleRate = fromSampleRate;
    this.toSampleRate = toSampleRate;
    this.channels = channels | 0;
    this.outputBufferSize = outputBufferSize;
    this.noReturn = !!noReturn;
    this.initialize();
}
Resampler.prototype.initialize = function () {
    //Perform some checks:
    if (this.fromSampleRate > 0 && this.toSampleRate > 0 && this.channels > 0) {
        if (this.fromSampleRate == this.toSampleRate) {
            //Setup a resampler bypass:
            this.resampler = this.bypassResampler;		//Resampler just returns what was passed through.
            this.ratioWeight = 1;
        }
        else {
            if (this.fromSampleRate < this.toSampleRate) {
                /*
                    Use generic linear interpolation if upsampling,
                    as linear interpolation produces a gradient that we want
                    and works fine with two input sample points per output in this case.
                */
                // this.compileLinearInterpolationFunction();
                // this.lastWeight = 1;
            }
            else {
                /*
                    Custom resampler I wrote that doesn't skip samples
                    like standard linear interpolation in high downsampling.
                    This is more accurate than linear interpolation on downsampling.
                */
                this.compileMultiTapFunction();
                this.tailExists = false;
                this.lastWeight = 0;
            }
            this.ratioWeight = this.fromSampleRate / this.toSampleRate;
            this.initializeBuffers();
        }
    }
    else {
        throw(new Error("Invalid settings specified for the resampler."));
    }
}


Resampler.prototype.compileMultiTapFunction = function () {
    var toCompile = "var bufferLength = buffer.length;\
	var outLength = this.outputBufferSize;\
	if ((bufferLength % " + this.channels + ") == 0) {\
		if (bufferLength > 0) {\
			var ratioWeight = this.ratioWeight;\
			var weight = 0;";
    for (var channel = 0; channel < this.channels; ++channel) {
        toCompile += "var output" + channel + " = 0;"
    }
    toCompile += "var actualPosition = 0;\
			var amountToNext = 0;\
			var alreadyProcessedTail = !this.tailExists;\
			this.tailExists = false;\
			var outputBuffer = this.outputBuffer;\
			var outputOffset = 0;\
			var currentPosition = 0;\
			do {\
				if (alreadyProcessedTail) {\
					weight = ratioWeight;";
    for (channel = 0; channel < this.channels; ++channel) {
        toCompile += "output" + channel + " = 0;"
    }
    toCompile += "}\
				else {\
					weight = this.lastWeight;";
    for (channel = 0; channel < this.channels; ++channel) {
        toCompile += "output" + channel + " = this.lastOutput[" + channel + "];"
    }
    toCompile += "alreadyProcessedTail = true;\
				}\
				while (weight > 0 && actualPosition < bufferLength) {\
					amountToNext = 1 + actualPosition - currentPosition;\
					if (weight >= amountToNext) {";
    for (channel = 0; channel < this.channels; ++channel) {
        toCompile += "output" + channel + " += buffer[actualPosition++] * amountToNext;"
    }
    toCompile += "currentPosition = actualPosition;\
						weight -= amountToNext;\
					}\
					else {";
    for (channel = 0; channel < this.channels; ++channel) {
        toCompile += "output" + channel + " += buffer[actualPosition" + ((channel > 0) ? (" + " + channel) : "") + "] * weight;"
    }
    toCompile += "currentPosition += weight;\
						weight = 0;\
						break;\
					}\
				}\
				if (weight == 0) {";
    for (channel = 0; channel < this.channels; ++channel) {
        toCompile += "outputBuffer[outputOffset++] = output" + channel + " / ratioWeight;"
    }
    toCompile += "}\
				else {\
					this.lastWeight = weight;";
    for (channel = 0; channel < this.channels; ++channel) {
        toCompile += "this.lastOutput[" + channel + "] = output" + channel + ";"
    }
    toCompile += "this.tailExists = true;\
					break;\
				}\
			} while (actualPosition < bufferLength && outputOffset < outLength);\
			return this.bufferSlice(outputOffset);\
		}\
		else {\
			return (this.noReturn) ? 0 : [];\
		}\
	}\
	else {\
		throw(new Error('Buffer was of incorrect sample length.'));\
	}";
    this.resampler = Function("buffer", toCompile);
}

Resampler.prototype.bypassResampler = function (buffer) {
    if (this.noReturn) {
        //Set the buffer passed as our own, as we don't need to resample it:
        this.outputBuffer = buffer;
        return buffer.length;
    }
    else {
        //Just return the buffer passsed:
        return buffer;
    }
}

Resampler.prototype.bufferSlice = function (sliceAmount) {
    if (this.noReturn) {
        //If we're going to access the properties directly from this object:
        return sliceAmount;
    }
    else {
        //Typed array and normal array buffer section referencing:
        try {
            return this.outputBuffer.subarray(0, sliceAmount);
        }
        catch (error) {
            try {
                //Regular array pass:
                this.outputBuffer.length = sliceAmount;
                return this.outputBuffer;
            }
            catch (error) {
                //Nightly Firefox 4 used to have the subarray function named as slice:
                return this.outputBuffer.slice(0, sliceAmount);
            }
        }
    }
}

Resampler.prototype.initializeBuffers = function () {
    //Initialize the internal buffer:
    try {
        this.outputBuffer = new Float32Array(this.outputBufferSize);
        this.lastOutput = new Float32Array(this.channels);
    }
    catch (error) {
        this.outputBuffer = [];
        this.lastOutput = [];
    }
}`

module.exports = "var sampleRate,outputBufferLength,compressPath;\n\nvar DEFAULT_MAX_VOLUME_LEVEL = 6;\n\nvar recBuffers  = [];\nvar pcmCache = [];\nvar pcmLength = 0;\n\nthis.onmessage = function(e){\n    switch(e.data.command){\n        case 'init':\n            init(e.data.config);\n            break;\n        case 'record':\n            record(e.data.buffer);\n            break;\n        case 'reset':\n            reset();\n            break;\n        case 'exportAudio':\n            exportAudio(e.data.type);\n            break;\n    }\n};\n\nfunction init(config){\n    sampleRate = 44100;\n    outputBufferLength = 1024;\n    compressPath = config.compressPath;\n}\nfunction reset(){\n    recBuffers = [];\n    pcmCache = [];\n    pcmLength = 0;\n}\n\nfunction record(inputBuffer){\n    var rss = new Resampler(sampleRate, 16000, 1, outputBufferLength, true);\n\n    var tempArray = [];\n    for (var i = 0 ; i < inputBuffer.length ; i++) {\n        tempArray.push(inputBuffer[i]);\n    }\n\n    var l = rss.resampler(tempArray);\n    var outputBuffer = new Float32Array(l);\n    for(var i = 0; i < l; i++)\n        outputBuffer[i] = rss.outputBuffer[i];\n\n    var data = floatTo16BitPCM(outputBuffer);\n\n    //pcmCache.push(data);\n    //pcmLength += data.length;\n\n    pcmCache.push(outputBuffer);\n    pcmLength += outputBuffer.length;\n\n    for (var i = 0 ; i < data.length ; i++) {\n        recBuffers.push(data[i]);\n    }\n\n    while(recBuffers.length > 320)\n    {\n        var items = recBuffers.splice(0, 320);\n        var result = new Int16Array(320);\n        for(var i = 0; i < 320; i++)\n        {\n            result[i] = items[i];\n        }\n\n        var volume = compute(result.buffer);\n        this.postMessage({'volume' : volume, 'buffer' : result, 'command': 'stream'});\n    }\n}\n\nfunction exportAudio(type) {\n    var dataview = null;\n\n\n    //var pa = new Int16Array(pcmLength);\n    var pa = new Float32Array(pcmLength);\n    var offset = 0;\n    for(var i = 0; i < pcmCache.length; ++i) {\n        pa.set(pcmCache[i], offset);\n        offset += pcmCache[i].length;\n    }\n\n    if(type == \"wav\") {\n        dataview = encodeWAV(pa);\n    }\n\n    var audioBlob = new Blob([dataview], {type: \"audio/wav\"});\n    this.postMessage({command: 'blob', blob: audioBlob});\n}\n\nfunction compute(pcmData)\n{\n    if(pcmData == null || pcmData.byteLength <= 0)\n    {\n        return 0;\n    }\n\n    var audioLevel = 0;\n    var sampleCount = pcmData.byteLength / 2;\n    var fEnergy = getCalEnergy(pcmData);\n    fEnergy = 10.0 *  Math.log(fEnergy / sampleCount);\n    if(fEnergy < 100)\n    {\n        audioLevel = 0;\n    }\n    else if(fEnergy > 200)\n    {\n        audioLevel = DEFAULT_MAX_VOLUME_LEVEL;\n    }\n    else\n    {\n        audioLevel = parseInt((fEnergy - 100) * (DEFAULT_MAX_VOLUME_LEVEL) / 100);\n    }\n    return audioLevel;\n}\n\nfunction getCalEnergy(pcmData)\n{\n    var fDirectOffset = 0;\n    var sampleCount = pcmData.byteLength / 128;\n    var data = new Int16Array(pcmData);\n\n    for(var i = 0; i < data.length; i ++)\n    {\n        fDirectOffset += data[i];\n    }\n\n    fDirectOffset /= sampleCount;\n    var fEnergy = 0;\n    for(var i = 0; i < data.length; i ++)\n    {\n        fEnergy += (data[i] - fDirectOffset) * (data[i] - fDirectOffset);\n    }\n    fEnergy += 400000;\n    return fEnergy;\n}\n\nfunction floatTo16BitPCM(input)\n{\n    var output = new Int16Array(input.length);\n    for (var i = 0; i < input.length; i++){\n        var s = Math.max(-1, Math.min(1, input[i]));\n        if(s < 0)\n            output[i] = s * 0x8000;\n        else\n            output[i] = s * 0x7FFF;\n    }\n    return output;\n}\n\nfunction writeString(view, offset, string){\n    for (var i = 0; i < string.length; i++){\n        view.setUint8(offset + i, string.charCodeAt(i));\n    }\n}\nfunction floatTo16BitPCM2(output, offset, input){\n    for (var i = 0; i < input.length; i++, offset+=2){\n        var s = Math.max(-1, Math.min(1, input[i]));\n        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);\n    }\n}\n\nfunction encodeWAV(samples){\n    var buffer = new ArrayBuffer(44 + samples.length*2);\n    var view = new DataView(buffer);\n\n    /* RIFF identifier */\n    writeString(view, 0, 'RIFF');\n    /* RIFF chunk length */\n    view.setUint32(4, 36 + samples.length*2, true);\n    /* RIFF type */\n    writeString(view, 8, 'WAVE');\n    /* format chunk identifier */\n    writeString(view, 12, 'fmt ');\n    /* format chunk length */\n    view.setUint32(16, 16, true);\n    /* sample format (raw) */\n    view.setUint16(20, 1, true);\n    /* channel count */\n    view.setUint16(22, 1, true);\n    /* sample rate */\n    view.setUint32(24, 16000, true);\n    /* byte rate (sample rate * block align) */\n    view.setUint32(28, 16000 * 4, true);\n    /* block align (channel count * bytes per sample) */\n    view.setUint16(32, 2, true);\n    /* bits per sample */\n    view.setUint16(34, 16, true);\n    /* data chunk identifier */\n    writeString(view, 36, 'data');\n    /* data chunk length */\n    view.setUint32(40, samples.length*2, true);\n\n    //view.setInt16(44, samples, true);\n    floatTo16BitPCM2(view, 44, samples);\n\n    return view;\n}\n\nfunction Resampler(fromSampleRate, toSampleRate, channels, outputBufferSize, noReturn) {\n\n    this.fromSampleRate = fromSampleRate;\n    this.toSampleRate = toSampleRate;\n    this.channels = channels | 0;\n    this.outputBufferSize = outputBufferSize;\n    this.noReturn = !!noReturn;\n    this.initialize();\n}\nResampler.prototype.initialize = function () {\n    //Perform some checks:\n    if (this.fromSampleRate > 0 && this.toSampleRate > 0 && this.channels > 0) {\n        if (this.fromSampleRate == this.toSampleRate) {\n            //Setup a resampler bypass:\n            this.resampler = this.bypassResampler;\t\t//Resampler just returns what was passed through.\n            this.ratioWeight = 1;\n        }\n        else {\n            if (this.fromSampleRate < this.toSampleRate) {\n                /*\n                    Use generic linear interpolation if upsampling,\n                    as linear interpolation produces a gradient that we want\n                    and works fine with two input sample points per output in this case.\n                */\n                // this.compileLinearInterpolationFunction();\n                // this.lastWeight = 1;\n            }\n            else {\n                /*\n                    Custom resampler I wrote that doesn't skip samples\n                    like standard linear interpolation in high downsampling.\n                    This is more accurate than linear interpolation on downsampling.\n                */\n                this.compileMultiTapFunction();\n                this.tailExists = false;\n                this.lastWeight = 0;\n            }\n            this.ratioWeight = this.fromSampleRate / this.toSampleRate;\n            this.initializeBuffers();\n        }\n    }\n    else {\n        throw(new Error(\"Invalid settings specified for the resampler.\"));\n    }\n}\n\n\nResampler.prototype.compileMultiTapFunction = function () {\n    var toCompile = \"var bufferLength = buffer.length;\tvar outLength = this.outputBufferSize;\tif ((bufferLength % \" + this.channels + \") == 0) {\t\tif (bufferLength > 0) {\t\t\tvar ratioWeight = this.ratioWeight;\t\t\tvar weight = 0;\";\n    for (var channel = 0; channel < this.channels; ++channel) {\n        toCompile += \"var output\" + channel + \" = 0;\"\n    }\n    toCompile += \"var actualPosition = 0;\t\t\tvar amountToNext = 0;\t\t\tvar alreadyProcessedTail = !this.tailExists;\t\t\tthis.tailExists = false;\t\t\tvar outputBuffer = this.outputBuffer;\t\t\tvar outputOffset = 0;\t\t\tvar currentPosition = 0;\t\t\tdo {\t\t\t\tif (alreadyProcessedTail) {\t\t\t\t\tweight = ratioWeight;\";\n    for (channel = 0; channel < this.channels; ++channel) {\n        toCompile += \"output\" + channel + \" = 0;\"\n    }\n    toCompile += \"}\t\t\t\telse {\t\t\t\t\tweight = this.lastWeight;\";\n    for (channel = 0; channel < this.channels; ++channel) {\n        toCompile += \"output\" + channel + \" = this.lastOutput[\" + channel + \"];\"\n    }\n    toCompile += \"alreadyProcessedTail = true;\t\t\t\t}\t\t\t\twhile (weight > 0 && actualPosition < bufferLength) {\t\t\t\t\tamountToNext = 1 + actualPosition - currentPosition;\t\t\t\t\tif (weight >= amountToNext) {\";\n    for (channel = 0; channel < this.channels; ++channel) {\n        toCompile += \"output\" + channel + \" += buffer[actualPosition++] * amountToNext;\"\n    }\n    toCompile += \"currentPosition = actualPosition;\t\t\t\t\t\tweight -= amountToNext;\t\t\t\t\t}\t\t\t\t\telse {\";\n    for (channel = 0; channel < this.channels; ++channel) {\n        toCompile += \"output\" + channel + \" += buffer[actualPosition\" + ((channel > 0) ? (\" + \" + channel) : \"\") + \"] * weight;\"\n    }\n    toCompile += \"currentPosition += weight;\t\t\t\t\t\tweight = 0;\t\t\t\t\t\tbreak;\t\t\t\t\t}\t\t\t\t}\t\t\t\tif (weight == 0) {\";\n    for (channel = 0; channel < this.channels; ++channel) {\n        toCompile += \"outputBuffer[outputOffset++] = output\" + channel + \" / ratioWeight;\"\n    }\n    toCompile += \"}\t\t\t\telse {\t\t\t\t\tthis.lastWeight = weight;\";\n    for (channel = 0; channel < this.channels; ++channel) {\n        toCompile += \"this.lastOutput[\" + channel + \"] = output\" + channel + \";\"\n    }\n    toCompile += \"this.tailExists = true;\t\t\t\t\tbreak;\t\t\t\t}\t\t\t} while (actualPosition < bufferLength && outputOffset < outLength);\t\t\treturn this.bufferSlice(outputOffset);\t\t}\t\telse {\t\t\treturn (this.noReturn) ? 0 : [];\t\t}\t}\telse {\t\tthrow(new Error('Buffer was of incorrect sample length.'));\t}\";\n    this.resampler = Function(\"buffer\", toCompile);\n}\n\nResampler.prototype.bypassResampler = function (buffer) {\n    if (this.noReturn) {\n        //Set the buffer passed as our own, as we don't need to resample it:\n        this.outputBuffer = buffer;\n        return buffer.length;\n    }\n    else {\n        //Just return the buffer passsed:\n        return buffer;\n    }\n}\n\nResampler.prototype.bufferSlice = function (sliceAmount) {\n    if (this.noReturn) {\n        //If we're going to access the properties directly from this object:\n        return sliceAmount;\n    }\n    else {\n        //Typed array and normal array buffer section referencing:\n        try {\n            return this.outputBuffer.subarray(0, sliceAmount);\n        }\n        catch (error) {\n            try {\n                //Regular array pass:\n                this.outputBuffer.length = sliceAmount;\n                return this.outputBuffer;\n            }\n            catch (error) {\n                //Nightly Firefox 4 used to have the subarray function named as slice:\n                return this.outputBuffer.slice(0, sliceAmount);\n            }\n        }\n    }\n}\n\nResampler.prototype.initializeBuffers = function () {\n    //Initialize the internal buffer:\n    try {\n        this.outputBuffer = new Float32Array(this.outputBufferSize);\n        this.lastOutput = new Float32Array(this.channels);\n    }\n    catch (error) {\n        this.outputBuffer = [];\n        this.lastOutput = [];\n    }\n}";


