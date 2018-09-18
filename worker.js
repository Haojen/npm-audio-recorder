module.exports = `var sampleRate,outputBufferLength,compressPath;

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