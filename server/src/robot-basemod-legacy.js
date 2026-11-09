'use strict';
// ---------------------------------------------------------------------------
// BaseMod 可读源码回退（2025-09-29 包，非 BaseMod 本体）
//
// 当前线上备份（酿酒机器人.zip，2026-05-28，RobotWare 6.15.02.00）里的
// BaseMod.mod 是受保护/加密模块（13,459 字节，sha256
// 9b21160c99b8f0ee4449512b2a4a94e62fb4ba9ccca04ec9a44538c4da4b5377），
// 无法读取 guodu / guodu_SAFE / MidPosCal 的正文。2025-09-29 导出的
// RobotStudio Pack&Go 包 "______1_20250929-143205.rspag"（含 GuJin-A1-4
// 控制器备份与虚拟系统、站文件 ______1_20250929-143205.rsstn）中，同名例程
// 仍是**未加密可读源码**：
//   - PROC guodu(...)          <- fenqu.mod 第 3816-4048 行
//   - PROC guodu_SAFE()        <- BuJiu.mod 第 790-853 行
//   - FUNC robtarget MidPosCal <- HongWai_GuoDu.mod 第 3-12 行
// 本文件逐行复制这三段正文（不重写、不补造动作），仅在 BaseMod 的**加密字节
// 完全匹配**上述备份时由 robot-sim.js 注册为兼容例程。2026 备份中的可读模块
// 仍以完全相同的签名调用 guodu / guodu_SAFE / MidPosCal，且这三个例程已从
// 2026 的 BuJiu.mod / fenqu.mod / HongWai_GuoDu.mod 中移除，说明受保护
// BaseMod 是它们的后继实现；但“2025 可读正文与 2026 加密 BaseMod 逐字节
// 一致”无法由现有材料证明，仍需程序作者确认或控制器轨迹复核。
//
// 证据、哈希与提取脚本：
//   .local/dsh-pot-20261106/compat/           （提取正文与清单）
//   .local/dsh-pot-20261106/build-basemod-legacy.cjs
// 详见 docs/ABB_GUODU_SAFE_RESTORE_20261106.md。
// ---------------------------------------------------------------------------
const PROVENANCE = {
  "generatedAt": "2026-11-06T08:52:33.741Z",
  "package": "D:/robotcx/七车间机器人/______1_20250929-143205.rspag",
  "packageSha256": "69350f139b27a29845cd78f336121e4b93e764119a07d8a3ed909871fa48fe65",
  "packageBytes": 98943042,
  "baseMod2026": {
    "entry": "backup_6700-551593-1_6700-551593_2026.5.28/RAPID/TASK1/PROGMOD/BaseMod.mod",
    "bytes": 13459,
    "sha256": "9b21160c99b8f0ee4449512b2a4a94e62fb4ba9ccca04ec9a44538c4da4b5377"
  },
  "extractedModules": {
    "HongWai_GuoDu.mod": {
      "bytes": 9501,
      "sha256": "cf7ff9bab898e4b13b5b8a66b568338753340d6205582843869f0ef1039511eb"
    },
    "fenqu.mod": {
      "bytes": 148526,
      "sha256": "8c7a1857ba96877c1e111a07d35fd11e4201bea07f58c5b9739dfde017fa3cd4"
    },
    "BuJiu.mod": {
      "bytes": 32498,
      "sha256": "30432e41f4dc16831f884b0e3b4ba41f49010fef68ba2eac5ca614a97b79b1bc"
    }
  },
  "backup2026": {
    "zip": "D:\\wx_xiangm\\xiangmu\\.local\\review-20261018\\robot-library\\01b7a45ee4996486ec6c300d249b1f1628ad152d23c1530c5fe31e42362406ad\\backup.zip",
    "zipSha256": "01b7a45ee4996486ec6c300d249b1f1628ad152d23c1530c5fe31e42362406ad",
    "moduleHashes": {
      "BuJiu.mod": "7a0948e41594df886ec4994ac7a64fa106140e67d974f3896f273b0f6d5062b8",
      "fenqu.mod": "ada115f3a12470c7aa8fd45717a492c291bf36b6c1c5f07701869634028ed879",
      "HongWai_GuoDu.mod": "e25cf84abe14e76e8b7b3a495788e4a5a13b0f7f42d78bdb38b2c806a3e8fb84",
      "ModMain.mod": "19a204be5e1bc32688e8f2f35052cbbe3a81d58f507c687653676712bb9f0523",
      "ModData.mod": "4ba1950871ff87e42f16da97f9b01c536064fc7be84d83f104bed60ab59176b7"
    }
  },
  "assembledSourceSha256": "450ee3d483c388c14b340f13b89a2ac668a6d94b46b687d4f0dfe857ac15eb8c",
  "assembledSourceBytes": 11902,
  "routines": [
    {
      "name": "MidPosCal",
      "kind": "FUNC",
      "file": "HongWai_GuoDu.mod",
      "moduleLineStart": 3,
      "moduleLineEnd": 12,
      "lines": 10,
      "textSha256": "ba37a86c0b2b696b015ba29a54629824a992bcc089ba0551c8c0194eed364cf9"
    },
    {
      "name": "guodu",
      "kind": "PROC",
      "file": "fenqu.mod",
      "moduleLineStart": 3816,
      "moduleLineEnd": 4048,
      "lines": 233,
      "textSha256": "7533fc3a3d2377ce61fc46213a5f6decef69e794b4255e2be127a1d9212a3c10"
    },
    {
      "name": "guodu_SAFE",
      "kind": "PROC",
      "file": "BuJiu.mod",
      "moduleLineStart": 790,
      "moduleLineEnd": 853,
      "lines": 64,
      "textSha256": "e63c61885f6ffc64c49fa9d91f4724ebdc54b36f13d08a63c93f5a83551cdb3a"
    }
  ]
};
const SOURCE = String.raw`MODULE BaseMod_20250929_Legacy

    FUNC robtarget MidPosCal(jointtarget J1,jointtarget J2,INOUT tooldata toolv,INOUT wobjdata wobj)
        VAR jointtarget JPos;
        JPos.robax.rax_1:=(J1.robax.rax_1+J2.robax.rax_1)/2;
        JPos.robax.rax_2:=(J1.robax.rax_2+J2.robax.rax_2)/2;
        JPos.robax.rax_3:=(J1.robax.rax_3+J2.robax.rax_3)/2;
        JPos.robax.rax_4:=(J1.robax.rax_4+J2.robax.rax_4)/2;
        JPos.robax.rax_5:=(J1.robax.rax_5+J2.robax.rax_5)/2;
        JPos.robax.rax_6:=(J1.robax.rax_6+J2.robax.rax_6)/2;
        RETURN CalcRobT(JPos,toolv\wobj:=wobj);
    ENDFUNC

    PROC guodu(num qidianc,num zhongdianc,robtarget pBarrelCenterx,string js_hy,PERS wobjdata wobjv,PERS TOOLdata TOOLCentre)
        VAR num pBarrelAppr_Z;
        lz:=0;
        toljiaodu:=EulerZYX(\Y,TOOLCentre.tframe.rot);
        x:=js_hy;
        BIANHUA:=ABS(qidianc-zhongdianc)*5;
        WaitTime\inpos,0;
        p111:=pBarrelCenterx;
        jointsCurrent:=CJointT();
        ROBOT6qian:=jointsCurrent.robax.rax_6;
        wobjJD66:=wobjV;
        anglez:=EulerZYX(\Z,wobjJD66.oframe.rot);
        ZGUODU:
        IF di96_zuozhen_shangliao=1 AND di97_youzhen_shangliao=0 THEN
            pBarrelAppr_Z:=pBarrelAppr_L.trans.Z;
            IF jointsCurrent.robax.rax_1<30 THEN
                TPWrite "sheng  chan  jiu  zhen  ZUO  and  YOU ERR ?";
                STOP;
                GOTO ZGUODU;
            ENDIF
        ELSEIF di96_zuozhen_shangliao=0 AND di97_youzhen_shangliao=1 THEN
            pBarrelAppr_Z:=pBarrelAppr_R.trans.Z;
            IF jointsCurrent.robax.rax_1>-30 THEN
                TPWrite "sheng  chan  jiu  zhen  ZUO  and  YOU ERR ?";
                STOP;
                GOTO ZGUODU;
            ENDIF
        ELSE
            STOP;
            TPWrite "sheng  chan  jiu  zhen  ZUO  and  YOU ERR ?";
            GOTO ZGUODU;
        ENDIF
        IF (hongwai>10 AND hongwai<20 AND x="HY1") OR (quyu_bu>10 AND quyu_bu<20 AND x="JS1") THEN
            lz:=nDisZOffs+pBarrelCenterx.trans.z+20;
        ENDIF
        IF (hongwai>20 AND hongwai<30 AND x="HY1") OR (quyu_bu>20 AND quyu_bu<30 AND x="JS1") THEN
            lz:=nDisZOffs+pBarrelCenterx.trans.z+20;
        ENDIF

        IF (hongwai>30 AND hongwai<40 AND x="HY1") OR (quyu_bu>30 AND quyu_bu<40 AND x="JS1") THEN
            lz:=nDisZOffs+pBarrelCenterx.trans.z+25;
        ENDIF
        IF (hongwai>40 AND hongwai<59 AND x="HY1") OR (quyu_bu>40 AND quyu_bu<59 AND x="JS1") THEN
            lz:=nDisZOffs+pBarrelCenterx.trans.z+40;
        ENDIF

        IF zhuan1=41 AND x="HY1" THEN
            lz:=nDisZOffs+pBarrelCenterx.trans.z+50;
        ENDIF

        IF zhuan1=51 AND x="JS1" THEN
            lz:=nDisZOffs+pBarrelCenterx.trans.z+40;
        ENDIF
        WaitUntil lz>0;

        wobjV:=wobjInUse;
        lx:=0;
        IF x="HY1" THEN
            ly:=nYCircleR_HY;
        ELSEIF x="JS1" THEN
            ly:=nYCircleR_BU;

        ELSE

            STOP;
        ENDIF

        IF ly>500 THEN
            ly:=500;
        ELSEif ly<-200 THEN
            ly:=-200;
        ENDIF

        lrz:=Round(lrz);
        lrz1:=Round((lrz MOD 360));
        lrz2:=Round((lrz MOD 90));
        f6:=Round((lrz1 DIV 90));
        IF f6>0 AND lrz2>0 THEN
            f6:=f6+1;
        ENDIF
        IF f6<0 AND lrz2<0 THEN
            f6:=f6-1;
        ENDIF
        f1:=-1;
        p111.trans.z:=lz;
        p111.trans.x:=lx;
        p111.trans.y:=ly;
        p111.robconf.cf6:=f6;
        ! stop;
        IF x="HY1" THEN
            wobjV.oframe.rot:=OrientZYX(nSign_HY*lingdian_HY*5+jiaodu_HY,0,0);

            IF ABS(toljiaodu)<3 THEN

                joints:=CalcJointT(RelTool(p111,0,0,0\Rz:=nAngleTilt_HY),tGripOutlet\WObj:=wobjV);
            ELSEIF ABS(toljiaodu)>17 AND ABS(toljiaodu)<23 THEN

                joints:=CalcJointT(RelTool(p111,0,0,0\Rz:=nAngleTilt_HY),tGripOutlet_PXX\WObj:=wobjV);
            ENDIF


        ELSEIF x="JS1" THEN
            wobjV.oframe.rot:=OrientZYX(nSign_bu*lingdian*5+jiaodu_bu,0,0);

            IF ABS(toljiaodu)<3 THEN

                joints:=CalcJointT(RelTool(p111,0,0,0\Rz:=nAngleTilt_bu),tGripOutlet\WObj:=wobjV);
            ELSEIF ABS(toljiaodu)>17 AND ABS(toljiaodu)<23 THEN

                joints:=CalcJointT(RelTool(p111,0,0,0\Rz:=nAngleTilt_bu),tGripOutlet_PXX\WObj:=wobjV);
            ENDIF


        ENDIF
        IF joints.robax.rax_6>0 THEN
            ROBOT3:=joints.robax.rax_6;
            ROBOT4:=ROBOT3-360;
        ELSE
            ROBOT4:=joints.robax.rax_6;
            ROBOT3:=ROBOT4+360;
        ENDIF
        ROBOTzhuan03:=Abs(ROBOT3-ROBOT6qian);
        ROBOTzhuan04:=Abs(ROBOT4-ROBOT6qian);
        IF ROBOTzhuan03=ROBOTzhuan04 THEN
            ROBOTzhuan03:=ROBOTzhuan03-1;
        ENDIF

        IF x="HY1" THEN
            IF (zhengfan_HY=1 AND nSign_HY=1) OR (zhengfan_HY=2 AND nSign_HY=-1) THEN
                IF ROBOTzhuan03<ROBOTzhuan04 THEN
                    joints.robax.rax_6:=ROBOT3;
                ELSE
                    joints.robax.rax_6:=ROBOT4;
                    IF ROBOT4<-360+BIANHUA THEN
                        joints.robax.rax_6:=ROBOT3;
                    ENDIF
                ENDIF

            ELSEIF (zhengfan_HY=2 AND nSign_HY=1) OR (zhengfan_HY=1 AND nSign_HY=-1) THEN
                IF ROBOTzhuan03<ROBOTzhuan04 THEN
                    joints.robax.rax_6:=ROBOT3;
                    IF ROBOT3>(360-BIANHUA) THEN
                        joints.robax.rax_6:=ROBOT4;
                    ENDIF
                ELSE
                    joints.robax.rax_6:=ROBOT4;

                ENDIF
            ENDIF
        ELSEIF x="JS1" THEN

            IF (zhengfan=1 AND nSign_BU=1) OR (zhengfan=2 AND nSign_BU=-1) THEN
                IF ROBOTzhuan03<ROBOTzhuan04 THEN
                    joints.robax.rax_6:=ROBOT3;
                ELSE
                    joints.robax.rax_6:=ROBOT4;
                    IF ROBOT4<-360+BIANHUA THEN
                        joints.robax.rax_6:=ROBOT3;
                    ENDIF
                ENDIF

            ELSEIF (zhengfan=2 AND nSign_BU=1) OR (zhengfan=1 AND nSign_BU=-1) THEN
                IF ROBOTzhuan03<ROBOTzhuan04 THEN
                    joints.robax.rax_6:=ROBOT3;
                    IF ROBOT3>(360-BIANHUA) THEN
                        joints.robax.rax_6:=ROBOT4;
                    ENDIF
                ELSE
                    joints.robax.rax_6:=ROBOT4;

                ENDIF
            ENDIF
        ENDIF

        ROBOT6:=joints.robax.rax_6;
        ROBOT6zhuan:=ROBOT6-ROBOT6qian;
        ROBOT6bian:=joints.robax.rax_6-ROBOT6qian;
        pCurrent11:=CRobT(\Tool:=TOOLCentre\WObj:=wobjJD66);

        IF (zhuan1>10 AND zhuan1<20 AND Abs(ROBOT6bian)>=120 AND pCurrent11.trans.z<pBarrelAppr_Z-50) OR ABS(ROBOT6bian)>=180 THEN
            IF ABS(toljiaodu)<3 THEN
                IF pCurrent11.trans.z>pBarrelAppr_Z-50 THEN
                    p111.trans.X:=0;
                    p111.trans.Y:=0;
                    WaitTime\InPos,0;
                    joints1:=CalcJointT(p111,TOOLCentre\WObj:=wobjV);
                    joints1.robax.rax_6:=joints.robax.rax_6;
                    MoveAbsJ joints1\NoEOffs,vWorkSpd1,z100,TOOLCentre\WObj:=wobjV;


                ELSE

                    pCurrent11.trans.z:=p111.trans.z;
                    pCurrent11.trans.X:=0;
                    pCurrent11.trans.Y:=0;
                    anglez4:=round(-ROBOT6bian/20);
                    FOR reg2 FROM 1 TO 18 DO
                        wobjJD66.oframe.rot:=orientZYX(anglez+(anglez4*reg2),0,0);
                        MoveL pCurrent11,vWorkSpd1,z50,TOOLCentre\WObj:=wobjJD66;
                    ENDFOR

                ENDIF

            ELSEIF ABS(toljiaodu)>17 AND ABS(toljiaodu)<23 THEN
                pCurrent11.trans.z:=p111.trans.z;
                pCurrent11.trans.X:=0;
                pCurrent11.trans.Y:=0;
                anglez4:=round(-ROBOT6bian/20);
                FOR reg2 FROM 1 TO 18 DO
                    wobjJD66.oframe.rot:=orientZYX(anglez+(anglez4*reg2),0,0);
                    MoveL pCurrent11,vWorkSpd1,z50,TOOLCentre\WObj:=wobjJD66;
                ENDFOR
            ENDIF
        ELSE
            IF ((ABS(ROBOT6bian)>=90 OR (zhuan1>10 AND zhuan1<20)) AND pCurrent11.trans.z<pBarrelAppr_Z-50) OR (lz<500 AND pCurrent11.trans.z>pBarrelAppr_Z-50 AND ABS(ROBOT6bian)>=90) OR ABS(ROBOT6bian)>=150 THEN
                TempL:=MidPosCal(joints,jointsCurrent,TOOLCentre,wobjV);
                Current_R:=Sqrt(TempL.trans.x*TempL.trans.x+TempL.trans.y*TempL.trans.y);
                IF Current_R>450 THEN
                    angle:=ATan2(TempL.trans.y,TempL.trans.x);
                    TempL.trans.x:=Trunc(Cos(angle)*450);
                    TempL.trans.y:=Trunc(Sin(angle)*450);
                ENDIF
                MoveL TempL,vWorkSpd1,z100,TOOLCentre\WObj:=wobjV;

            ELSEIF (zhuan1>40 OR (quyu_bu>40 AND x="JS1") OR (hongwai>40 AND x="HY1")) AND pCurrent11.trans.z<pBarrelAppr_Z-50 THEN
                MoveL OFFS(pCurrent11,0,0,40),vWorkSpd1,z50,TOOLCentre\WObj:=wobjJD66;

            ENDIF
        ENDIF
        zhuan1:=0;


    ENDPROC

    PROC guodu_SAFE()

        VAR robtarget pCurrent;
        VAR num nMidOffsx6;
        VAR num nMidOffsY6;
        AccSet 100,80;
        WaitTime\inpos,0;
        Reset do22_boji_zz_DK;
        jointsCurrent2:=CJointT();
        pCurrent:=CRobT(\Tool:=tGripCentre\WObj:=wobjjidian);
        pCurrent336:=CRobT(\Tool:=tGripOutlet\WObj:=wobjjidian);
        p11:=pCurrent;
        ZY4:
        IF di96_zuozhen_shangliao=1 AND di97_youzhen_shangliao=0 THEN
            nMidOffsx6:=pCurrent.trans.X;
            nMidOffsY6:=pCurrent.trans.Y;
            p11.trans.x:=p11.trans.x+(-nMidOffsx6);
            p11.trans.y:=p11.trans.y+(-nMidOffsY6);
            IF jointsCurrent2.robax.rax_1<30 THEN
                TPWrite "sheng  chan  jiu  zhen  ZUO  and  YOU ERR ?";
                Stop;
                GOTO ZY4;
            ENDIF
            IF p11.trans.Z<pBarrelAppr_L.trans.Z-50 THEN
                IF (Abs(pCurrent336.trans.Y)<188 AND (zhuanGAO=31 OR zhuanGAO=41 OR zhuanGAO=51)) OR (Abs(pCurrent336.trans.Y)<388 AND (zhuanGAO=21) AND nDisZOffs>300 AND Abs(jointsCurrent2.robax.rax_6-j_zhogzhuan_L.robax.rax_6)<90) THEN

                ELSE
                    MoveL p11,vWorkSpd1,z100,tGripCentre\WObj:=wobjjidian;
                ENDIF
            ENDIF
            Reset do16_dakai_huzhao;
            MoveAbsJ j_zhogzhuan_L\NoEOffs,vMediumSpd,z50,tGripOutlet\WObj:=WobjBarrelL;
            MoveL pBarrelAppr_L,vWorkSpd1,z50,tGripOutlet\WObj:=WobjBarrelL;



        ELSEIF di96_zuozhen_shangliao=0 AND di97_youzhen_shangliao=1 THEN
            nMidOffsx6:=pCurrent.trans.X;
            nMidOffsY6:=pCurrent.trans.Y;
            p11.trans.x:=p11.trans.x+(-nMidOffsx6);
            p11.trans.y:=p11.trans.y+(-nMidOffsY6);
            IF jointsCurrent2.robax.rax_1>-30 THEN
                TPWrite "sheng  chan  jiu  zhen  ZUO  and  YOU ERR ?";
                Stop;
                GOTO ZY4;
            ENDIF
            IF p11.trans.Z<pBarrelAppr_R.trans.Z-50 THEN
                IF (Abs(pCurrent336.trans.Y)<188 AND (zhuanGAO=31 OR zhuanGAO=41 OR zhuanGAO=51)) OR (Abs(pCurrent336.trans.Y)<388 AND (zhuanGAO=21) AND nDisZOffs>300 AND Abs(jointsCurrent2.robax.rax_6-j_zhogzhuan_R.robax.rax_6)<90) THEN

                ELSE
                    MoveL p11,vWorkSpd1,z100,tGripCentre\WObj:=wobjjidian;
                ENDIF
            ENDIF
            Reset do16_dakai_huzhao;
            MoveAbsJ j_zhogzhuan_R\NoEOffs,vMediumSpd,z50,tGripOutlet\WObj:=WobjBarrelR;
            MoveL pBarrelAppr_R,vWorkSpd1,z50,tGripOutlet\WObj:=WobjBarrelR;
        ELSE
            !TPErase;
            TPWrite "sheng  chan  jiu  zhen  ZUO  and  YOU ?";
            Stop;
            GOTO ZY4;
        ENDIF
        zhuanGAO:=0;
    ENDPROC

ENDMODULE
`;
const ROUTINES = [
  {
    "name": "MidPosCal",
    "kind": "FUNC",
    "startLine": 3,
    "endLine": 12,
    "source": {
      "fileId": "legacy:basemod-20250929",
      "sourceFile": "HongWai_GuoDu.mod",
      "sourceLineStart": 3,
      "sourceLineEnd": 12,
      "sourceSha256": "cf7ff9bab898e4b13b5b8a66b568338753340d6205582843869f0ef1039511eb",
      "note": "2025-09-29 GuJin-A1-4 备份未加密源码；与 2026-05-28 BaseMod 的逐字节一致性未确认"
    }
  },
  {
    "name": "guodu",
    "kind": "PROC",
    "startLine": 14,
    "endLine": 246,
    "source": {
      "fileId": "legacy:basemod-20250929",
      "sourceFile": "fenqu.mod",
      "sourceLineStart": 3816,
      "sourceLineEnd": 4048,
      "sourceSha256": "8c7a1857ba96877c1e111a07d35fd11e4201bea07f58c5b9739dfde017fa3cd4",
      "note": "2025-09-29 GuJin-A1-4 备份未加密源码；与 2026-05-28 BaseMod 的逐字节一致性未确认"
    }
  },
  {
    "name": "guodu_SAFE",
    "kind": "PROC",
    "startLine": 248,
    "endLine": 311,
    "source": {
      "fileId": "legacy:basemod-20250929",
      "sourceFile": "BuJiu.mod",
      "sourceLineStart": 790,
      "sourceLineEnd": 853,
      "sourceSha256": "30432e41f4dc16831f884b0e3b4ba41f49010fef68ba2eac5ca614a97b79b1bc",
      "note": "2025-09-29 GuJin-A1-4 备份未加密源码；与 2026-05-28 BaseMod 的逐字节一致性未确认"
    }
  }
];
const FILE_ID = 'legacy:basemod-20250929';
const FILE_NAME = 'BaseMod(2025-09-29可读源码).mod';

// Slice the requested routines out of SOURCE and rebuild a compilable module
// file with fresh line ranges (the compiler uses file-relative line numbers).
function fileFor(names) {
  const wanted = new Set((names && names.length ? names : ROUTINES.map(item => item.name)).map(String));
  const selected = ROUTINES.filter(item => wanted.has(item.name));
  const sourceLines = SOURCE.split('\n');
  const lines = ['MODULE BaseMod_20250929_Legacy'];
  const routines = [];
  for (const item of selected) {
    lines.push('');
    const start = lines.length + 1;
    lines.push(...sourceLines.slice(item.startLine - 1, item.endLine));
    routines.push({ name: item.name, kind: item.kind, startLine: start, endLine: lines.length, legacy: item.source });
  }
  lines.push(''); lines.push('ENDMODULE');
  return { id: FILE_ID, name: FILE_NAME, kind: 'program', readable: true, legacy: true, task: 'T_ROB1', text: lines.join('\n') + '\n', routines };
}
// Only the exact protected module from the 2026-05-28 backup may use this copy.
function matchesProtectedBase(file) {
  const expected = PROVENANCE.baseMod2026;
  return !!expected && !!file && /basemod\.mod$/i.test(String(file.name || '')) && !file.readable &&
    String(file.sha256 || '').toLowerCase() === expected.sha256;
}
// Server-only: deliver the readable copy with the already authenticated backup
// response. The browser interpreter must not import this source module, since
// its worker is a public static asset.
function withLegacySource(report) {
  if (report.sha256 !== PROVENANCE.backup2026.zipSha256 || !report.files.some(matchesProtectedBase)) return report;
  return { ...report, simulationCompatibility: { file: fileFor(), provenance: PROVENANCE } };
}
module.exports = { PROVENANCE, SOURCE, ROUTINES, FILE_ID, FILE_NAME, fileFor, matchesProtectedBase, withLegacySource, routineNames: ROUTINES.map(item => item.name) };
