// ============================================================
// MediaPipe Tasks Vision
// ============================================================

import {
    FaceLandmarker,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";


// ============================================================
// 設定
// ============================================================


// ------------------------------------------------------------
// Google Apps Script WebアプリURL
// ------------------------------------------------------------
//
// GASをデプロイした後、
// /exec で終わるURLをここへ貼り付ける。
//
// 例：
// const GAS_URL =
//     "https://script.google.com/macros/s/xxxxxxxx/exec";
//
const GAS_URL =
    "https://script.google.com/macros/s/AKfycbwjt1zy7u-ma1_hUMgdrI79za9j6R6XM-DPfJ79rZ8--kYsfZIbpbDnNv2pZ0ym3_jVGg/exec";


// ------------------------------------------------------------
// カメラプレビュー
// ------------------------------------------------------------
//
// false:
//     参加者にはカメラ映像を表示しない。
//     カメラとMediaPipe自体は動作する。
//
// true:
//     左上にカメラ映像を表示する。
//
const SHOW_CAMERA_PREVIEW =
    false;


// ------------------------------------------------------------
// キャリブレーション時間
// ------------------------------------------------------------
//
// Unity版 MouthCalibrationManager と同じ。
//
// prepareTime = 0.5秒
// measurementTime = 1.5秒
//

const CALIBRATION_PREPARE_TIME_MS =
    500;


const CALIBRATION_MEASUREMENT_TIME_MS =
    1500;


// ------------------------------------------------------------
// Neutral DeadZone
// ------------------------------------------------------------
//
// Unity版 PlayerController:
//
// mouthDeadZone = 0.12
//
// Jaw / Smile / Pucker の最大値が
// 0.12未満の場合はNeutral。
//
const MOUTH_DEAD_ZONE =
    0.12;


// ------------------------------------------------------------
// BE保持時間
// ------------------------------------------------------------
//
// Unity版 PlayerController:
//
// beHoldTime = 0.15秒
//
const BE_HOLD_TIME_MS =
    150;


// ------------------------------------------------------------
// 実験
// ------------------------------------------------------------

// 10セット
const TOTAL_SETS =
    10;


// 1セット:
//
// A
// I
// U
// BE
//
const MOUTHS_PER_SET =
    4;


// 合計40口形
const TOTAL_TRIALS =
    TOTAL_SETS *
    MOUTHS_PER_SET;


// 1口形1秒
const MOUTH_DURATION_MS =
    1000;


// ------------------------------------------------------------
// ログ記録周期
// ------------------------------------------------------------
//
// MouthLogは約0.1秒間隔で記録する。
//
// 重要:
//
// これはMediaPipeの推論周期ではない。
//
// 0.1秒ごとに
// 「その時点で最新のMediaPipe推論結果」
// を参照してログへ保存する。
//
// そのため同じ推論結果を複数回参照する可能性がある。
// それを確認するためInferenceIdを保存する。
//
const LOG_INTERVAL_MS =
    100;


// ------------------------------------------------------------
// 口形順序
// ------------------------------------------------------------

const MOUTH_SEQUENCE = [

    "A",

    "I",

    "U",

    "BE"
];


// ------------------------------------------------------------
// 画面表示
// ------------------------------------------------------------

const MOUTH_DISPLAY = {

    A:
        "あ",

    I:
        "い",

    U:
        "う",

    BE:
        "べ"
};


// ------------------------------------------------------------
// キャリブレーション説明
// ------------------------------------------------------------
//
// Unity版 MouthCalibrationManager と同じ。
//
const CALIBRATION_INSTRUCTIONS = {

    A:
        "口を大きく開けてください",

    I:
        "口を横に広げてください",

    U:
        "口を前にすぼめてください",

    BE:
        "口を開けて舌を出してください"
};


// ============================================================
// DOM
// ============================================================

const setupScreen =
    document.getElementById(
        "setupScreen"
    );


const calibrationScreen =
    document.getElementById(
        "calibrationScreen"
    );


const readyScreen =
    document.getElementById(
        "readyScreen"
    );


const countdownScreen =
    document.getElementById(
        "countdownScreen"
    );


const experimentScreen =
    document.getElementById(
        "experimentScreen"
    );


const finishScreen =
    document.getElementById(
        "finishScreen"
    );


// ------------------------------------------------------------
// Setup
// ------------------------------------------------------------

const sessionIdInput =
    document.getElementById(
        "sessionIdInput"
    );


const prepareCameraButton =
    document.getElementById(
        "prepareCameraButton"
    );


const startCalibrationButton =
    document.getElementById(
        "startCalibrationButton"
    );


const cameraStatus =
    document.getElementById(
        "cameraStatus"
    );


// ------------------------------------------------------------
// Calibration
// ------------------------------------------------------------

const calibrationMouth =
    document.getElementById(
        "calibrationMouth"
    );


const calibrationInstruction =
    document.getElementById(
        "calibrationInstruction"
    );


const calibrationStatus =
    document.getElementById(
        "calibrationStatus"
    );


const calibrationProgressText =
    document.getElementById(
        "calibrationProgressText"
    );


const calibrationProgressBar =
    document.getElementById(
        "calibrationProgressBar"
    );


// ------------------------------------------------------------
// Ready
// ------------------------------------------------------------

const startExperimentButton =
    document.getElementById(
        "startExperimentButton"
    );


// ------------------------------------------------------------
// Countdown
// ------------------------------------------------------------

const countdownText =
    document.getElementById(
        "countdownText"
    );


// ------------------------------------------------------------
// Experiment
// ------------------------------------------------------------

const setDisplay =
    document.getElementById(
        "setDisplay"
    );


const mouthDisplay =
    document.getElementById(
        "mouthDisplay"
    );


// ------------------------------------------------------------
// Finish
// ------------------------------------------------------------

const sendDataButton =
    document.getElementById(
        "sendDataButton"
    );


const backupButton =
    document.getElementById(
        "backupButton"
    );


const sendStatus =
    document.getElementById(
        "sendStatus"
    );


// ------------------------------------------------------------
// Camera
// ------------------------------------------------------------

const webcam =
    document.getElementById(
        "webcam"
    );


const cameraContainer =
    document.getElementById(
        "cameraContainer"
    );


// ============================================================
// MediaPipe状態
// ============================================================

let faceLandmarker =
    null;


let cameraStream =
    null;


let mediaPipeRunning =
    false;


// ------------------------------------------------------------
// 最後に推論したvideo.currentTime
// ------------------------------------------------------------
//
// 同じ映像フレームに対して
// detectForVideo()を何度も実行しないために使用。
//
let lastVideoTime =
    -1;


// ------------------------------------------------------------
// MediaPipe推論ID
// ------------------------------------------------------------
//
// detectForVideo()から新しい結果を取得するたびに
// +1する。
//
// MouthLogの0.1秒サンプリングとは独立。
//
// 例:
//
// Time     InferenceId
// 0.10     120
// 0.20     120
// 0.30     121
//
// この場合、最初の2サンプルは
// 同じMediaPipe推論結果を参照している。
//
let inferenceCounter =
    0;


// ------------------------------------------------------------
// 最新MediaPipe結果
// ------------------------------------------------------------

let latestMouthData = {

    faceDetected:
        false,

    jaw:
        0,

    smile:
        0,

    pucker:
        0,

    timestamp:
        0,

    inferenceId:
        0
};


// ============================================================
// Session
// ============================================================

let sessionId =
    "";


// ============================================================
// キャリブレーション
// ============================================================
//
// Unity版 MouthCalibrationManager:
//
// A
// I
// U
// BE
//
// それぞれについて
//
// Jaw
// Smile
// Pucker
//
// の中央値を保持する。
//
let calibrationResult = {

    A: {

        jaw:
            0,

        smile:
            0,

        pucker:
            0
    },


    I: {

        jaw:
            0,

        smile:
            0,

        pucker:
            0
    },


    U: {

        jaw:
            0,

        smile:
            0,

        pucker:
            0
    },


    BE: {

        jaw:
            0,

        smile:
            0,

        pucker:
            0
    }
};


// ============================================================
// 認識状態
// ============================================================

// BE候補になった開始時刻
let beStartTime =
    null;


// UnityではBEが0.15秒未満の場合、
// SetLane()を実行せず前の状態を維持する。
// Web版でも同じ考え方で使用する。
let lastRecognized =
    "N";


// ============================================================
// 実験状態
// ============================================================

let experimentRunning =
    false;


let experimentStartTime =
    0;


let experimentAnimationFrame =
    null;


let logTimer =
    null;


// ------------------------------------------------------------
// 現在画面に提示している口形
// ------------------------------------------------------------
//
// MouthLogのTargetMouthへ保存する。
//
// A / I / U / BE
//
let currentTargetMouth =
    "A";


// ============================================================
// MouthLog
// ============================================================

let mouthLogs =
    [];


// ============================================================
// 送信
// ============================================================

let dataSent =
    false;


// ============================================================
// 初期化
// ============================================================

initializePage();


function initializePage() {

    // --------------------------------------------------------
    // カメラプレビュー
    // --------------------------------------------------------

    if (
        !SHOW_CAMERA_PREVIEW
    ) {

        cameraContainer.style.display =
            "none";
    }


    // --------------------------------------------------------
    // Event
    // --------------------------------------------------------

    prepareCameraButton.addEventListener(

        "click",

        prepareCamera
    );


    startCalibrationButton.addEventListener(

        "click",

        startCalibration
    );


    startExperimentButton.addEventListener(

        "click",

        startCountdown
    );


    sendDataButton.addEventListener(

        "click",

        sendData
    );


    backupButton.addEventListener(

        "click",

        downloadBackup
    );
}


// ============================================================
// 画面切り替え
// ============================================================

function showScreen(
    targetScreen
) {

    const screens = [

        setupScreen,

        calibrationScreen,

        readyScreen,

        countdownScreen,

        experimentScreen,

        finishScreen
    ];


    for (
        const screen of screens
    ) {

        screen.classList.add(
            "hidden"
        );
    }


    targetScreen.classList.remove(
        "hidden"
    );
}


// ============================================================
// カメラ準備
// ============================================================

async function prepareCamera() {

    // --------------------------------------------------------
    // SessionID
    // --------------------------------------------------------

    sessionId =
        sessionIdInput.value.trim();


    if (
        !sessionId
    ) {

        alert(
            "Session IDを入力してください。"
        );

        return;
    }


    prepareCameraButton.disabled =
        true;


    sessionIdInput.disabled =
        true;


    cameraStatus.textContent =
        "カメラを起動しています...";


    try {

        // ----------------------------------------------------
        // Camera
        // ----------------------------------------------------

        cameraStream =
            await navigator.mediaDevices.getUserMedia({

                video: {

                    facingMode:
                        "user",

                    width: {

                        ideal:
                            640
                    },

                    height: {

                        ideal:
                            480
                    }
                },

                audio:
                    false
            });


        webcam.srcObject =
            cameraStream;


        await webcam.play();


        // ----------------------------------------------------
        // MediaPipe
        // ----------------------------------------------------

        cameraStatus.textContent =
            "MediaPipeを準備しています...";


        await initializeMediaPipe();


        // ----------------------------------------------------
        // 推論開始
        // ----------------------------------------------------

        mediaPipeRunning =
            true;


        requestAnimationFrame(
            mediaPipeLoop
        );


        // ----------------------------------------------------
        // 顔検出待ち
        // ----------------------------------------------------

        cameraStatus.textContent =
            "顔をカメラに映してください...";


        const detected =
            await waitForFaceDetection(
                10000
            );


        if (
            !detected
        ) {

            throw new Error(
                "顔を検出できませんでした。"
            );
        }


        // ----------------------------------------------------
        // 完了
        // ----------------------------------------------------

        cameraStatus.textContent =
            "準備完了";


        startCalibrationButton.disabled =
            false;

    }
    catch (
        error
    ) {

        console.error(
            error
        );


        cameraStatus.textContent =
            "準備に失敗しました。";


        prepareCameraButton.disabled =
            false;


        sessionIdInput.disabled =
            false;


        alert(

            "カメラまたはMediaPipeの準備に失敗しました。\n\n" +

            error.message
        );
    }
}


// ============================================================
// MediaPipe初期化
// ============================================================

async function initializeMediaPipe() {

    // --------------------------------------------------------
    // WASM
    // --------------------------------------------------------

    const vision =
        await FilesetResolver.forVisionTasks(

            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
        );


    // --------------------------------------------------------
    // FaceLandmarker
    // --------------------------------------------------------

    faceLandmarker =
        await FaceLandmarker.createFromOptions(

            vision,

            {

                baseOptions: {

                    modelAssetPath:

                        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",

                    delegate:
                        "GPU"
                },


                runningMode:
                    "VIDEO",


                numFaces:
                    1,


                outputFaceBlendshapes:
                    true,


                outputFacialTransformationMatrixes:
                    false
            }
        );
}


// ============================================================
// MediaPipe Loop
// ============================================================

function mediaPipeLoop() {

    if (
        !mediaPipeRunning
    ) {

        return;
    }


    // --------------------------------------------------------
    // Video準備確認
    // --------------------------------------------------------

    if (
        webcam.readyState >= 2 &&
        webcam.currentTime !== lastVideoTime
    ) {

        // ----------------------------------------------------
        // 新しいVideoフレーム
        // ----------------------------------------------------

        lastVideoTime =
            webcam.currentTime;


        const timestamp =
            performance.now();


        try {

            // ------------------------------------------------
            // MediaPipe推論
            // ------------------------------------------------

            const result =
                faceLandmarker.detectForVideo(

                    webcam,

                    timestamp
                );


            // ------------------------------------------------
            // 推論結果処理
            // ------------------------------------------------

            processMediaPipeResult(

                result,

                timestamp
            );

        }
        catch (
            error
        ) {

            console.error(

                "MediaPipe Error:",

                error
            );
        }
    }


    // --------------------------------------------------------
    // 次フレーム
    // --------------------------------------------------------

    requestAnimationFrame(
        mediaPipeLoop
    );
}


// ============================================================
// MediaPipe結果
// ============================================================

function processMediaPipeResult(
    result,
    timestamp
) {

    // --------------------------------------------------------
    // 新しい推論結果
    // --------------------------------------------------------
    //
    // MouthLogを保存した回数ではない。
    //
    // MediaPipeから新しい推論結果を
    // 受け取った回数。
    //
    inferenceCounter++;


    // --------------------------------------------------------
    // 顔なし
    // --------------------------------------------------------

    if (
        !result ||
        !result.faceBlendshapes ||
        result.faceBlendshapes.length === 0
    ) {

        latestMouthData = {

            faceDetected:
                false,

            jaw:
                0,

            smile:
                0,

            pucker:
                0,

            timestamp:
                timestamp,

            inferenceId:
                inferenceCounter
        };


        return;
    }


    // --------------------------------------------------------
    // BlendShape一覧
    // --------------------------------------------------------

    const categories =
        result.faceBlendshapes[0].categories;


    // --------------------------------------------------------
    // jawOpen
    // --------------------------------------------------------

    const jaw =
        getBlendshapeScore(

            categories,

            "jawOpen"
        );


    // --------------------------------------------------------
    // Smile
    // --------------------------------------------------------

    const smileLeft =
        getBlendshapeScore(

            categories,

            "mouthSmileLeft"
        );


    const smileRight =
        getBlendshapeScore(

            categories,

            "mouthSmileRight"
        );


    const smile =
        Math.max(

            smileLeft,

            smileRight
        );


    // --------------------------------------------------------
    // mouthPucker
    // --------------------------------------------------------

    const pucker =
        getBlendshapeScore(

            categories,

            "mouthPucker"
        );


    // --------------------------------------------------------
    // 最新結果
    // --------------------------------------------------------

    latestMouthData = {

        faceDetected:
            true,

        jaw:
            jaw,

        smile:
            smile,

        pucker:
            pucker,

        timestamp:
            timestamp,

        inferenceId:
            inferenceCounter
    };
}


// ============================================================
// BlendShape取得
// ============================================================

function getBlendshapeScore(
    categories,
    name
) {

    const item =
        categories.find(

            category =>

                category.categoryName ===
                name
        );


    if (
        !item
    ) {

        return 0;
    }


    return item.score;
}


// ============================================================
// 顔検出待機
// ============================================================

async function waitForFaceDetection(
    timeoutMs
) {

    const start =
        performance.now();


    while (
        performance.now() -
        start <
        timeoutMs
    ) {

        if (
            latestMouthData.faceDetected
        ) {

            return true;
        }


        await sleep(
            100
        );
    }


    return false;
}


// ============================================================
// キャリブレーション開始
// ============================================================

async function startCalibration() {

    startCalibrationButton.disabled =
        true;


    showScreen(
        calibrationScreen
    );


    try {

        // ----------------------------------------------------
        // A
        // ----------------------------------------------------

        calibrationResult.A =
            await calibrateOneMouth(

                "A",

                1
            );


        // ----------------------------------------------------
        // I
        // ----------------------------------------------------

        calibrationResult.I =
            await calibrateOneMouth(

                "I",

                2
            );


        // ----------------------------------------------------
        // U
        // ----------------------------------------------------

        calibrationResult.U =
            await calibrateOneMouth(

                "U",

                3
            );


        // ----------------------------------------------------
        // BE
        // ----------------------------------------------------

        calibrationResult.BE =
            await calibrateOneMouth(

                "BE",

                4
            );


        // ----------------------------------------------------
        // Console確認
        // ----------------------------------------------------

        console.log(
            "===== Calibration Result ====="
        );


        console.table(
            calibrationResult
        );


        // ----------------------------------------------------
        // 完了表示
        // ----------------------------------------------------

        calibrationMouth.textContent =
            "OK!";


        calibrationInstruction.textContent =
            "準備完了";


        calibrationStatus.textContent =
            "実験を開始できます";


        calibrationProgressBar.style.width =
            "100%";


        await sleep(
            800
        );


        showScreen(
            readyScreen
        );

    }
    catch (
        error
    ) {

        console.error(
            error
        );


        alert(

            "キャリブレーション中にエラーが発生しました。\n\n" +

            error.message
        );


        showScreen(
            setupScreen
        );


        startCalibrationButton.disabled =
            false;
    }
}


// ============================================================
// 1口形キャリブレーション
// ============================================================

async function calibrateOneMouth(
    mouthType,
    number
) {

    // --------------------------------------------------------
    // UI
    // --------------------------------------------------------

    calibrationMouth.textContent =
        MOUTH_DISPLAY[
            mouthType
        ];


    calibrationInstruction.textContent =
        CALIBRATION_INSTRUCTIONS[
            mouthType
        ];


    calibrationProgressText.textContent =
        `${number} / 4`;


    calibrationStatus.textContent =
        "準備...";


    calibrationProgressBar.style.width =
        "0%";


    // --------------------------------------------------------
    // 準備
    //
    // Unity:
    // prepareTime = 0.5
    // --------------------------------------------------------

    await sleep(
        CALIBRATION_PREPARE_TIME_MS
    );


    // --------------------------------------------------------
    // Measurement
    // --------------------------------------------------------

    calibrationStatus.textContent =
        "そのままキープ！";


    const jawSamples =
        [];


    const smileSamples =
        [];


    const puckerSamples =
        [];


    const measurementStart =
        performance.now();


    // --------------------------------------------------------
    // 1.5秒測定
    // --------------------------------------------------------

    while (
        performance.now() -
        measurementStart <
        CALIBRATION_MEASUREMENT_TIME_MS
    ) {

        // ----------------------------------------------------
        // 顔が検出されている場合のみ取得
        // ----------------------------------------------------

        if (
            latestMouthData.faceDetected
        ) {

            jawSamples.push(
                latestMouthData.jaw
            );


            smileSamples.push(
                latestMouthData.smile
            );


            puckerSamples.push(
                latestMouthData.pucker
            );
        }


        // ----------------------------------------------------
        // Progress
        // ----------------------------------------------------

        const elapsed =
            performance.now() -
            measurementStart;


        const progress =
            Math.min(

                elapsed /
                CALIBRATION_MEASUREMENT_TIME_MS,

                1
            );


        calibrationProgressBar.style.width =
            `${progress * 100}%`;


        // ----------------------------------------------------
        // UnityのUpdateに近い周期で最新値を取得。
        //
        // MediaPipe推論周期そのものではない。
        // ----------------------------------------------------

        await sleep(
            16
        );
    }


    // --------------------------------------------------------
    // データ確認
    // --------------------------------------------------------

    if (
        jawSamples.length === 0
    ) {

        throw new Error(

            `${MOUTH_DISPLAY[mouthType]} の測定中に顔情報を取得できませんでした。`
        );
    }


    // --------------------------------------------------------
    // Median
    // --------------------------------------------------------

    const result = {

        jaw:
            calculateMedian(
                jawSamples
            ),

        smile:
            calculateMedian(
                smileSamples
            ),

        pucker:
            calculateMedian(
                puckerSamples
            )
    };


    console.log(

        `[Calibration ${mouthType}]`,

        result,

        `Samples=${jawSamples.length}`
    );


    return result;
}


// ============================================================
// Median
// ============================================================
//
// Unity版 MouthCalibrationManager:
// CalculateMedian()
// と同じ計算方法。
//
function calculateMedian(
    values
) {

    if (
        !values ||
        values.length === 0
    ) {

        return 0;
    }


    // --------------------------------------------------------
    // 元配列を変更しないようコピー
    // --------------------------------------------------------

    const sorted =
        [...values].sort(

            (a, b) =>
                a - b
        );


    const middle =
        Math.floor(

            sorted.length /
            2
        );


    // --------------------------------------------------------
    // 偶数
    // --------------------------------------------------------

    if (
        sorted.length %
        2 ===
        0
    ) {

        return (

            sorted[middle - 1] +

            sorted[middle]

        ) / 2;
    }


    // --------------------------------------------------------
    // 奇数
    // --------------------------------------------------------

    return sorted[
        middle
    ];
}


// ============================================================
// Countdown
// ============================================================

async function startCountdown() {

    startExperimentButton.disabled =
        true;


    showScreen(
        countdownScreen
    );


    // --------------------------------------------------------
    // 3
    // --------------------------------------------------------

    countdownText.textContent =
        "3";


    await sleep(
        1000
    );


    // --------------------------------------------------------
    // 2
    // --------------------------------------------------------

    countdownText.textContent =
        "2";


    await sleep(
        1000
    );


    // --------------------------------------------------------
    // 1
    // --------------------------------------------------------

    countdownText.textContent =
        "1";


    await sleep(
        1000
    );


    // --------------------------------------------------------
    // 開始
    // --------------------------------------------------------

    countdownText.textContent =
        "開始";


    await sleep(
        500
    );


    startExperiment();
}


// ============================================================
// 実験開始
// ============================================================

function startExperiment() {

    // --------------------------------------------------------
    // ログ初期化
    // --------------------------------------------------------

    mouthLogs =
        [];


    dataSent =
        false;


    // --------------------------------------------------------
    // 認識状態初期化
    // --------------------------------------------------------

    beStartTime =
        null;


    lastRecognized =
        "N";


    currentTargetMouth =
        "A";


    // --------------------------------------------------------
    // 実験開始
    // --------------------------------------------------------

    experimentRunning =
        true;


    experimentStartTime =
        performance.now();


    // --------------------------------------------------------
    // 実験画面
    // --------------------------------------------------------

    showScreen(
        experimentScreen
    );


    // --------------------------------------------------------
    // 最初の表示を確実にAにする
    // --------------------------------------------------------

    setDisplay.textContent =
        `1 / ${TOTAL_SETS}`;


    mouthDisplay.textContent =
        MOUTH_DISPLAY.A;


    // --------------------------------------------------------
    // MouthLog
    //
    // 約0.1秒周期
    // --------------------------------------------------------

    logTimer =
        setInterval(

            recordMouthLog,

            LOG_INTERVAL_MS
        );


    // --------------------------------------------------------
    // 実験画面更新
    // --------------------------------------------------------

    updateExperiment();
}


// ============================================================
// 実験更新
// ============================================================
//
// 1秒ごとにsetTimeoutを連鎖させず、
// performance.now()から現在Trialを計算する。
//
// これにより累積的なタイマーずれを抑える。
//
function updateExperiment() {

    if (
        !experimentRunning
    ) {

        return;
    }


    const now =
        performance.now();


    const elapsed =
        now -
        experimentStartTime;


    // --------------------------------------------------------
    // 実験時間
    //
    // 40口形 × 1秒 = 40秒
    // --------------------------------------------------------

    const totalDuration =
        TOTAL_TRIALS *
        MOUTH_DURATION_MS;


    // --------------------------------------------------------
    // 終了
    // --------------------------------------------------------

    if (
        elapsed >=
        totalDuration
    ) {

        finishExperiment();

        return;
    }


    // --------------------------------------------------------
    // Trial
    //
    // 0～39
    // --------------------------------------------------------

    const trialIndex =
        Math.floor(

            elapsed /
            MOUTH_DURATION_MS
        );


    // --------------------------------------------------------
    // Set
    //
    // 0～9
    // --------------------------------------------------------

    const setIndex =
        Math.floor(

            trialIndex /
            MOUTHS_PER_SET
        );


    // --------------------------------------------------------
    // Mouth Index
    //
    // 0 = A
    // 1 = I
    // 2 = U
    // 3 = BE
    // --------------------------------------------------------

    const mouthIndex =
        trialIndex %
        MOUTHS_PER_SET;


    const targetMouth =
        MOUTH_SEQUENCE[
            mouthIndex
        ];


    // --------------------------------------------------------
    // TargetMouth
    // --------------------------------------------------------

    currentTargetMouth =
        targetMouth;


    // --------------------------------------------------------
    // UI
    // --------------------------------------------------------

    setDisplay.textContent =
        `${setIndex + 1} / ${TOTAL_SETS}`;


    mouthDisplay.textContent =
        MOUTH_DISPLAY[
            targetMouth
        ];


    // --------------------------------------------------------
    // Next Frame
    // --------------------------------------------------------

    experimentAnimationFrame =
        requestAnimationFrame(
            updateExperiment
        );
}


// ============================================================
// 口形認識
// ============================================================
//
// Unity PlayerController と同じ基本ロジック。
//
// 1.
// max(Jaw, Smile, Pucker) < 0.12
// → Neutral
//
// 2.
// それ以外は
// A / I / U / BE
// のキャリブレーション基準点との
// ユークリッド距離を計算。
//
// 3.
// 最小距離の口形を候補にする。
//
// 4.
// BEのみ0.15秒保持して確定。
// ============================================================

function recognizeCurrentMouth(
    jaw,
    smile,
    pucker,
    now
) {

    // --------------------------------------------------------
    // 距離
    // --------------------------------------------------------
    //
    // Neutralの場合でも解析用に距離を保存するため、
    // 先に4距離を計算する。
    //

    const distA =
        calculateDistance(

            jaw,
            smile,
            pucker,

            calibrationResult.A
        );


    const distI =
        calculateDistance(

            jaw,
            smile,
            pucker,

            calibrationResult.I
        );


    const distU =
        calculateDistance(

            jaw,
            smile,
            pucker,

            calibrationResult.U
        );


    const distBE =
        calculateDistance(

            jaw,
            smile,
            pucker,

            calibrationResult.BE
        );


    // --------------------------------------------------------
    // Neutral
    // --------------------------------------------------------

    const maxValue =
        Math.max(

            jaw,

            smile,

            pucker
        );


    if (
        maxValue <
        MOUTH_DEAD_ZONE
    ) {

        beStartTime =
            null;


        lastRecognized =
            "N";


        return {

            recognized:
                "N",

            distA:
                distA,

            distI:
                distI,

            distU:
                distU,

            distBE:
                distBE
        };
    }


    // --------------------------------------------------------
    // 最小距離
    // --------------------------------------------------------
    //
    // Unityと同じくAから開始。
    //

    let recognized =
        "A";


    let minDistance =
        distA;


    // --------------------------------------------------------
    // I
    // --------------------------------------------------------

    if (
        distI <
        minDistance
    ) {

        minDistance =
            distI;


        recognized =
            "I";
    }


    // --------------------------------------------------------
    // U
    // --------------------------------------------------------

    if (
        distU <
        minDistance
    ) {

        minDistance =
            distU;


        recognized =
            "U";
    }


    // --------------------------------------------------------
    // BE
    // --------------------------------------------------------

    if (
        distBE <
        minDistance
    ) {

        minDistance =
            distBE;


        recognized =
            "BE";
    }


    // --------------------------------------------------------
    // BE Stability
    // --------------------------------------------------------
    //
    // Unity:
    //
    // recognized == "べ"
    // の状態が0.15秒継続した場合のみ
    // SetLane(3, "べ")
    //
    // 0.15秒未満では前状態を維持する。
    //

    if (
        recognized ===
        "BE"
    ) {

        // ----------------------------------------------------
        // BE候補開始
        // ----------------------------------------------------

        if (
            beStartTime ===
            null
        ) {

            beStartTime =
                now;
        }


        // ----------------------------------------------------
        // 0.15秒以上
        // ----------------------------------------------------

        if (
            now -
            beStartTime >=
            BE_HOLD_TIME_MS
        ) {

            lastRecognized =
                "BE";
        }


        // ----------------------------------------------------
        // 0.15秒未満の場合は
        // lastRecognizedを変更しない。
        // ----------------------------------------------------

        return {

            recognized:
                lastRecognized,

            distA:
                distA,

            distI:
                distI,

            distU:
                distU,

            distBE:
                distBE
        };
    }


    // --------------------------------------------------------
    // BE候補でなくなった
    // --------------------------------------------------------

    beStartTime =
        null;


    // --------------------------------------------------------
    // A / I / U
    // --------------------------------------------------------

    lastRecognized =
        recognized;


    return {

        recognized:
            recognized,

        distA:
            distA,

        distI:
            distI,

        distU:
            distU,

        distBE:
            distBE
    };
}


// ============================================================
// ユークリッド距離
// ============================================================
//
// Unity:
//
// sqrt(
//     jawDiff² +
//     smileDiff² +
//     puckerDiff²
// )
//
function calculateDistance(
    jaw,
    smile,
    pucker,
    target
) {

    const jawDiff =
        jaw -
        target.jaw;


    const smileDiff =
        smile -
        target.smile;


    const puckerDiff =
        pucker -
        target.pucker;


    return Math.sqrt(

        jawDiff *
        jawDiff

        +

        smileDiff *
        smileDiff

        +

        puckerDiff *
        puckerDiff
    );
}


// ============================================================
// MouthLog
// ============================================================
//
// 約0.1秒ごとに実行。
//
// 注意:
//
// 0.1秒ごとにMediaPipe推論を
// 実行しているわけではない。
//
// その時点で最新の
// latestMouthData
// を使用する。
//
// InferenceIdによって
// 同じ推論結果の再利用を判別できる。
// ============================================================

function recordMouthLog() {

    if (
        !experimentRunning
    ) {

        return;
    }


    // --------------------------------------------------------
    // 顔未検出
    // --------------------------------------------------------
    //
    // 顔が検出されていない場合、
    // Jaw=0などを実測値として保存すると
    // Neutralと誤認する可能性がある。
    //
    // そのためログ行自体を作成しない。
    //

    if (
        !latestMouthData.faceDetected
    ) {

        return;
    }


    const now =
        performance.now();


    // --------------------------------------------------------
    // Time
    //
    // 実験開始からの経過秒
    // --------------------------------------------------------

    const elapsedSeconds =
        (
            now -
            experimentStartTime
        )
        /
        1000;


    // --------------------------------------------------------
    // 最新MediaPipe値
    // --------------------------------------------------------

    const jaw =
        latestMouthData.jaw;


    const smile =
        latestMouthData.smile;


    const pucker =
        latestMouthData.pucker;


    // --------------------------------------------------------
    // 認識
    // --------------------------------------------------------

    const recognition =
        recognizeCurrentMouth(

            jaw,

            smile,

            pucker,

            now
        );


    // --------------------------------------------------------
    // Log
    // --------------------------------------------------------

    mouthLogs.push({

        // ----------------------------------------------------
        // SessionID
        // ----------------------------------------------------

        SessionID:
            sessionId,


        // ----------------------------------------------------
        // Time
        //
        // 実験開始からの経過秒
        // ----------------------------------------------------

        Time:
            elapsedSeconds,


        // ----------------------------------------------------
        // TargetMouth
        //
        // 現在画面に提示している口形。
        //
        // A
        // I
        // U
        // BE
        // ----------------------------------------------------

        TargetMouth:
            currentTargetMouth,


        // ----------------------------------------------------
        // MediaPipe BlendShape
        // ----------------------------------------------------

        Jaw:
            jaw,


        Smile:
            smile,


        Pucker:
            pucker,


        // ----------------------------------------------------
        // キャリブレーション基準点との距離
        // ----------------------------------------------------

        DistA:
            recognition.distA,


        DistI:
            recognition.distI,


        DistU:
            recognition.distU,


        DistBE:
            recognition.distBE,


        // ----------------------------------------------------
        // Recognized
        //
        // 内部認識結果。
        //
        // A
        // I
        // U
        // BE
        // N
        //
        // 参加者画面には表示しない。
        // ----------------------------------------------------

        Recognized:
            recognition.recognized,


        // ----------------------------------------------------
        // InferenceId
        //
        // MediaPipeが新しい推論結果を取得するたび
        // +1される。
        //
        // 同じIDが複数行にある場合、
        // 同じ推論結果を複数の0.1秒ログが
        // 参照している。
        // ----------------------------------------------------

        InferenceId:
            latestMouthData.inferenceId,


        // ----------------------------------------------------
        // Lane
        //
        // 非ゲーム条件では使用しない。
        //
        // -1 = 未使用
        // ----------------------------------------------------

        Lane:
            -1
    });
}


// ============================================================
// 実験終了
// ============================================================

function finishExperiment() {

    experimentRunning =
        false;


    // --------------------------------------------------------
    // Log Timer
    // --------------------------------------------------------

    if (
        logTimer !==
        null
    ) {

        clearInterval(
            logTimer
        );


        logTimer =
            null;
    }


    // --------------------------------------------------------
    // AnimationFrame
    // --------------------------------------------------------

    if (
        experimentAnimationFrame !==
        null
    ) {

        cancelAnimationFrame(
            experimentAnimationFrame
        );


        experimentAnimationFrame =
            null;
    }


    // --------------------------------------------------------
    // Finish
    // --------------------------------------------------------

    showScreen(
        finishScreen
    );


    sendStatus.textContent =
        "データはまだ送信されていません。";


    console.log(
        "Experiment Finished"
    );


    console.log(
        "MouthLog Rows:",
        mouthLogs.length
    );
}


// ============================================================
// GAS送信
// ============================================================

async function sendData() {

    // --------------------------------------------------------
    // 二重送信防止
    // --------------------------------------------------------

    if (
        dataSent
    ) {

        return;
    }


    // --------------------------------------------------------
    // URL確認
    // --------------------------------------------------------

    if (
        GAS_URL ===
        "ここにGASのWebアプリURL"
    ) {

        alert(
            "script.js の GAS_URL を設定してください。"
        );


        return;
    }


    // --------------------------------------------------------
    // UI
    // --------------------------------------------------------

    sendDataButton.disabled =
        true;


    sendStatus.textContent =
        "送信中...";


    // --------------------------------------------------------
    // CalibrationResult
    // --------------------------------------------------------

    const calibrationPayload = {

        SessionID:
            sessionId,


        DateTime:
            new Date().toISOString(),


        // ----------------------------------------------------
        // A
        // ----------------------------------------------------

        A_Jaw:
            calibrationResult.A.jaw,


        A_Smile:
            calibrationResult.A.smile,


        A_Pucker:
            calibrationResult.A.pucker,


        // ----------------------------------------------------
        // I
        // ----------------------------------------------------

        I_Jaw:
            calibrationResult.I.jaw,


        I_Smile:
            calibrationResult.I.smile,


        I_Pucker:
            calibrationResult.I.pucker,


        // ----------------------------------------------------
        // U
        // ----------------------------------------------------

        U_Jaw:
            calibrationResult.U.jaw,


        U_Smile:
            calibrationResult.U.smile,


        U_Pucker:
            calibrationResult.U.pucker,


        // ----------------------------------------------------
        // BE
        // ----------------------------------------------------

        BE_Jaw:
            calibrationResult.BE.jaw,


        BE_Smile:
            calibrationResult.BE.smile,


        BE_Pucker:
            calibrationResult.BE.pucker
    };


    // --------------------------------------------------------
    // Payload
    // --------------------------------------------------------

    const payload = {

        calibration:
            calibrationPayload,


        mouthLogs:
            mouthLogs
    };


    try {

        // ----------------------------------------------------
        // URLSearchParams
        // ----------------------------------------------------
        //
        // JSONをpayloadというフォーム値として送る。
        //

        const body =
            new URLSearchParams();


        body.append(

            "payload",

            JSON.stringify(
                payload
            )
        );


        // ----------------------------------------------------
        // POST
        // ----------------------------------------------------

        const response =
            await fetch(

                GAS_URL,

                {

                    method:
                        "POST",

                    body:
                        body
                }
            );


        // ----------------------------------------------------
        // Response
        // ----------------------------------------------------

        const result =
            await response.json();


        if (
            !result.success
        ) {

            throw new Error(

                result.message ||

                "GAS側でエラーが発生しました。"
            );
        }


        // ----------------------------------------------------
        // 成功
        // ----------------------------------------------------

        dataSent =
            true;


        sendStatus.textContent =

            "送信成功：" +

            `CalibrationResult 1行 / ` +

            `MouthLog ${result.mouthLogRows}行`;


        // 成功後は再送信不可
        sendDataButton.disabled =
            true;


        // バックアップは保存可能
        backupButton.disabled =
            false;


        console.log(
            "Send Success:",
            result
        );

    }
    catch (
        error
    ) {

        console.error(
            error
        );


        // ----------------------------------------------------
        // 失敗
        //
        // mouthLogsとcalibrationResultは削除しない。
        // ----------------------------------------------------

        sendStatus.textContent =

            "送信失敗。データはブラウザ内に保持されています。";


        // 再送信可能
        sendDataButton.disabled =
            false;


        alert(

            "データ送信に失敗しました。\n\n" +

            error.message
        );
    }
}


// ============================================================
// Backup
// ============================================================

function downloadBackup() {

    // --------------------------------------------------------
    // CalibrationResult
    // --------------------------------------------------------

    const calibrationPayload = {

        SessionID:
            sessionId,


        DateTime:
            new Date().toISOString(),


        A_Jaw:
            calibrationResult.A.jaw,

        A_Smile:
            calibrationResult.A.smile,

        A_Pucker:
            calibrationResult.A.pucker,


        I_Jaw:
            calibrationResult.I.jaw,

        I_Smile:
            calibrationResult.I.smile,

        I_Pucker:
            calibrationResult.I.pucker,


        U_Jaw:
            calibrationResult.U.jaw,

        U_Smile:
            calibrationResult.U.smile,

        U_Pucker:
            calibrationResult.U.pucker,


        BE_Jaw:
            calibrationResult.BE.jaw,

        BE_Smile:
            calibrationResult.BE.smile,

        BE_Pucker:
            calibrationResult.BE.pucker
    };


    // --------------------------------------------------------
    // Backup
    // --------------------------------------------------------

    const backup = {

        calibration:
            calibrationPayload,


        mouthLogs:
            mouthLogs
    };


    // --------------------------------------------------------
    // JSON
    // --------------------------------------------------------

    const json =
        JSON.stringify(

            backup,

            null,

            2
        );


    // --------------------------------------------------------
    // Blob
    // --------------------------------------------------------

    const blob =
        new Blob(

            [json],

            {

                type:
                    "application/json"
            }
        );


    // --------------------------------------------------------
    // Download
    // --------------------------------------------------------

    const url =
        URL.createObjectURL(
            blob
        );


    const anchor =
        document.createElement(
            "a"
        );


    anchor.href =
        url;


    anchor.download =
        `${sessionId}_NonGame_Backup.json`;


    document.body.appendChild(
        anchor
    );


    anchor.click();


    anchor.remove();


    URL.revokeObjectURL(
        url
    );
}


// ============================================================
// Sleep
// ============================================================

function sleep(
    ms
) {

    return new Promise(

        resolve =>

            setTimeout(

                resolve,

                ms
            )
    );
}


// ============================================================
// ページ終了
// ============================================================

window.addEventListener(

    "beforeunload",

    () => {

        // ----------------------------------------------------
        // MediaPipe停止
        // ----------------------------------------------------

        mediaPipeRunning =
            false;


        // ----------------------------------------------------
        // Camera停止
        // ----------------------------------------------------

        if (
            cameraStream
        ) {

            const tracks =
                cameraStream.getTracks();


            for (
                const track of tracks
            ) {

                track.stop();
            }
        }


        // ----------------------------------------------------
        // FaceLandmarker解放
        // ----------------------------------------------------

        if (
            faceLandmarker
        ) {

            try {

                faceLandmarker.close();

            }
            catch (
                error
            ) {

                console.warn(
                    error
                );
            }
        }
    }
);